#!/usr/bin/env node
/**
 * test-research-5cat.mjs
 * CLI test for the 5-category sustainability research flow using Nova web grounding.
 *
 * Usage:
 *   node scripts/test-research-5cat.mjs --companies "Tesla,Apple" [--output ./output/research]
 *   node scripts/test-research-5cat.mjs --companies "Microsoft" --model amazon.nova-lite-v1:0
 *   node scripts/test-research-5cat.mjs --companies "Manatts Inc" --industry "construction contractor"
 *
 * Use --industry to disambiguate companies from similarly-named unrelated organizations.
 * Output: one JSON file per category in the output folder.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  BedrockRuntimeClient,
  ConverseCommand,
} from '@aws-sdk/client-bedrock-runtime';

// ── CLI args ──────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (!tok.startsWith('--')) continue;
    const key = tok.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) { args[key] = true; continue; }
    args[key] = next;
    i++;
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));

if (!args.companies) {
  console.error('Usage: node scripts/test-research-5cat.mjs --companies "Company1,Company2" [--output ./output/research] [--model amazon.nova-lite-v1:0]');
  process.exit(1);
}

const companies   = args.companies.split(',').map(c => c.trim()).filter(Boolean);
const outputDir   = resolve(args.output || './output/research');
const industry    = args.industry || 'construction infrastructure materials heavy industry';
// nova_grounding requires nova-premier; lite/micro/pro return ValidationException
// Nova requires the cross-region inference profile prefix (e.g. us.amazon.nova-premier-v1:0)
const rawModelId  = args.model || process.env.BEDROCK_RESEARCH_MODEL_ID || 'amazon.nova-premier-v1:0';
const modelId     = /^(us|eu|ap)\./.test(rawModelId) ? rawModelId : `us.${rawModelId}`;
const region      = args.region || process.env.AWS_REGION || 'us-east-1';

console.log(`\n🔬 5-Category Research Test`);
console.log(`   Companies : ${companies.join(', ')}`);
console.log(`   Industry  : ${industry}`);
console.log(`   Model     : ${modelId}`);
console.log(`   Region    : ${region}`);
console.log(`   Output    : ${outputDir}\n`);

// ── Bedrock client ────────────────────────────────────────────────────────────

const client = new BedrockRuntimeClient({ region });

// ── Nova web grounding search ────────────────────────────────────────────────

function stripThinking(text) {
  // Remove closed tags: <thinking ...>...</thinking>
  let out = text.replace(/<thinking[^>]*>[\s\S]*?<\/thinking>/gi, '');
  // Remove unclosed opening tags and everything after them on the same "thought"
  // (Nova sometimes emits <thinking > text without a closing tag)
  out = out.replace(/<thinking[^>]*>[\s\S]*/gi, '');
  return out.replace(/\s+/g, ' ').trim();
}

function extractNovaGroundingResults(response, query) {
  const contentItems = response?.output?.message?.content || [];
  let answerText = '';
  const raw = [];

  for (const item of contentItems) {
    if (typeof item?.text === 'string') answerText += item.text + ' ';

    const citations = item?.citationsContent?.citations || [];
    for (const citation of citations) {
      const url = citation?.location?.web?.url;
      if (!url || !url.startsWith('http')) continue;
      const title   = citation?.location?.web?.title || citation?.location?.web?.domain || url;
      const snippet = citation?.sourceContent?.text ||
                      citation?.generatedResponsePart?.textResponsePart?.text || '';
      raw.push({ title, url, snippet });
    }
  }

  const cleanAnswer = stripThinking(answerText);

  const seen = new Set();
  const results = [];
  for (const item of raw) {
    if (seen.has(item.url)) continue;
    seen.add(item.url);
    results.push({ title: item.title || item.url, url: item.url, snippet: stripThinking(item.snippet) || '' });
  }

  // Always inject the full Nova answer as a synthetic entry so fullText() returns complete content
  if (cleanAnswer) {
    results.push({
      title: `Nova summary: ${query}`,
      url:   `https://search.example.com?q=${encodeURIComponent(query)}`,
      snippet: cleanAnswer,
    });
  } else if (results.length === 0) {
    return [];
  }
  return results;
}

async function bingRssSearch(query) {
  const url = `https://www.bing.com/search?format=rss&q=${encodeURIComponent(query)}`;
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': 'research-test/1.0', accept: 'application/rss+xml, text/xml' },
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const results = [];
    const seen = new Set();
    for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)) {
      const block = m[1];
      const link  = block.match(/<link[^>]*>(.*?)<\/link>/i)?.[1]?.trim() ||
                    block.match(/<guid[^>]*>(.*?)<\/guid>/i)?.[1]?.trim() || '';
      const title = block.match(/<title[^>]*><!\[CDATA\[(.*?)\]\]><\/title>/i)?.[1] ||
                    block.match(/<title[^>]*>(.*?)<\/title>/i)?.[1] || 'Result';
      const snip  = block.match(/<description[^>]*><!\[CDATA\[(.*?)\]\]><\/description>/i)?.[1] ||
                    block.match(/<description[^>]*>(.*?)<\/description>/i)?.[1] || '';
      if (!link || !link.startsWith('http') || seen.has(link)) continue;
      seen.add(link);
      results.push({ title: title.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>'),
                     url: link,
                     snippet: snip.replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>') });
      if (results.length >= 5) break;
    }
    return results;
  } catch { return []; }
}

async function novaSearch(query) {
  process.stdout.write(`  → ${query.slice(0, 80)}… `);
  try {
    const cmd = new ConverseCommand({
      modelId,
      messages: [{ role: 'user', content: [{ text: `Search the public web for sources about this query. Return cited sources only. Query: ${query}` }] }],
      system: [{ text: `You are researching companies in the ${industry} sector. Focus strictly on the named company as a ${industry} business — not on law firms, financial advisors, or other similarly-named organizations. If results are ambiguous, prefer sources about the ${industry} company.` }],
      toolConfig: { tools: [{ systemTool: { name: 'nova_grounding' } }] },
    });
    const resp = await client.send(cmd);
    const results = extractNovaGroundingResults(resp, query);
    if (results.length > 0) {
      console.log(`✓ ${results.length} result(s) [nova grounding]`);
      return results;
    }
    throw new Error('no citations');
  } catch {
    // Fallback to Bing RSS
    const results = await bingRssSearch(query);
    if (results.length > 0) {
      console.log(`✓ ${results.length} result(s) [bing rss fallback]`);
      return results;
    }
    console.log(`✗ no results`);
    return [];
  }
}

// ── 5-category queries ────────────────────────────────────────────────────────

const CATEGORIES = {
  emissions:    (c) => `"${c}" carbon emissions reduction commitment net zero climate pledge 2024 2025`,
  investments:  (c) => `"${c}" sustainability investment renewable energy climate fund 2024 2025`,
  purchases:    (c) => `"${c}" equipment purchase clean energy renewable infrastructure 2024 2025`,
  pilots:       (c) => `"${c}" pilot project carbon capture sustainability initiative 2024 2025`,
  environments: (c) => `"${c}" project environment sustainability facility green 2024 2025`,
};

// ── Structured data builders ─────────────────────────────────────────────────

// Detects when Nova says it couldn't find information
const NO_INFO_PATTERN = /\b(i (can ?not|couldn'?t|do ?not|don'?t) (find|locate|identify|confirm)|no (specific |exact |direct |available |public |direct public )?(information|data|details|evidence|results?|records?)|unable to (find|locate|confirm)|not (found|available|public)|no (web )?results? (found|available)|did not find|could not find|no (?:public )?(?:announcements?|mention|record))\b/i;

function hasNoInfo(text) {
  return NO_INFO_PATTERN.test(text);
}

// Deduplicate and merge all snippets from results into one clean text block
function fullText(results) {
  const seen = new Set();
  return results
    .map(r => stripThinking(r.snippet || ''))
    .filter(t => { if (!t || seen.has(t)) return false; seen.add(t); return true; })
    .join('\n');
}

function buildEmissions(company, results) {
  const text = fullText(results);
  if (hasNoInfo(text)) {
    return {
      Company: company,
      Country: '',
      'Emissions Reduction Target': '',
      'Target Year': '',
      'Baseline Year': '',
      'Pledge Year': '',
      'Net-Zero Target': false,
      Comments: '',
      Source: [],
    };
  }
  const targetMatch = text.match(/(\d+)%\s+(?:reduction|target)/i);
  const yearMatch   = text.match(/(?:by|target year)\s+(\d{4})/i);
  return {
    Company: company,
    Country: '',
    'Emissions Reduction Target': targetMatch ? `${targetMatch[1]}%` : '',
    'Target Year':   yearMatch ? yearMatch[1] : '',
    'Baseline Year': '',
    'Pledge Year':   '',
    'Net-Zero Target': /net[\s-]zero/i.test(text),
    Comments: text,
    Source: results.map(r => r.url).filter(Boolean),
  };
}

function buildInvestments(company, results) {
  const text = fullText(results);
  if (hasNoInfo(text)) {
    return {
      Company: company,
      Country: '',
      'Investment Type': '',
      'Announcement Date': '',
      Description: '',
      Comments: '',
      Source: [],
    };
  }
  const types = ['renewable energy','solar','wind','electric vehicles','EV','charging','carbon','sustainability','clean energy'];
  const matched = types.find(t => text.toLowerCase().includes(t));
  return {
    Company: company,
    Country: '',
    'Investment Type': matched ? matched.charAt(0).toUpperCase() + matched.slice(1) : '',
    'Announcement Date': '',
    Description: text,
    Comments: '',
    Source: results.map(r => r.url).filter(Boolean),
  };
}

function buildPurchases(company, results) {
  const text = fullText(results);
  if (hasNoInfo(text)) {
    return {
      Company: company,
      Country: '',
      Manufacturer: '',
      'Machine Type': '',
      Model: '',
      Quantity: '',
      'Purchase Date': '',
      Comments: '',
      Source: [],
    };
  }
  const qtyMatch = text.match(/(\d+)\s+(?:new\s+)?(?:truck|vehicle|machine|unit)/i);
  return {
    Company: company,
    Country: '',
    Manufacturer: '',
    'Machine Type': '',
    Model: '',
    Quantity: qtyMatch ? parseInt(qtyMatch[1]) : '',
    'Purchase Date': '',
    Comments: text,
    Source: results.map(r => r.url).filter(Boolean),
  };
}

function buildPilots(company, results) {
  const text = fullText(results);
  if (hasNoInfo(text)) {
    return {
      Company: company,
      Country: '',
      'Project Name': '',
      'Project Type': '',
      Involvement: '',
      'Lower Emissions Approach': '',
      'Electric Equipment & Manufacturer': '',
      'Project Description': '',
      Comments: '',
      Source: [],
    };
  }
  const topTitle = results.find(r => r.title && !r.title.match(/^https?:|^\w+\.\w+$/))?.title || '';
  return {
    Company: company,
    Country: '',
    'Project Name': topTitle,
    'Project Type': '',
    Involvement: '',
    'Lower Emissions Approach': '',
    'Electric Equipment & Manufacturer': '',
    'Project Description': text,
    Comments: '',
    Source: results.map(r => r.url).filter(Boolean),
  };
}

function buildEnvironments(company, results) {
  const text = fullText(results);
  if (hasNoInfo(text)) {
    return {
      Company: company,
      Country: '',
      Project: '',
      'Constraint Type': [],
      'Project Date': '',
      Description: '',
      Comments: '',
      Source: [],
    };
  }
  const topTitle = results.find(r => r.title && !r.title.match(/^https?:|^\w+\.\w+$/))?.title || '';
  return {
    Company: company,
    Country: '',
    Project: topTitle,
    'Constraint Type': [],
    'Project Date': '',
    Description: text,
    Comments: '',
    Source: results.map(r => r.url).filter(Boolean),
  };
}

const BUILDERS = {
  emissions:    buildEmissions,
  investments:  buildInvestments,
  purchases:    buildPurchases,
  pilots:       buildPilots,
  environments: buildEnvironments,
};

// ── Main ──────────────────────────────────────────────────────────────────────

async function researchCompany(company) {
  console.log(`\n📋 Researching: ${company}`);
  const entries = {};
  // All 5 categories in parallel for this company
  await Promise.all(
    Object.entries(CATEGORIES).map(async ([cat, queryFn]) => {
      const results = await novaSearch(queryFn(company));
      entries[cat] = results.length > 0 ? BUILDERS[cat](company, results) : null;
      if (!entries[cat]) console.log(`     ⚠  No results for ${cat} (${company})`);
    })
  );
  return entries;
}

async function main() {
  await mkdir(outputDir, { recursive: true });

  const categoryData = { emissions: [], investments: [], purchases: [], pilots: [], environments: [] };

  // All companies in parallel
  const allResults = await Promise.all(companies.map(researchCompany));

  for (const entries of allResults) {
    for (const cat of Object.keys(categoryData)) {
      if (entries[cat]) categoryData[cat].push(entries[cat]);
    }
  }

  // Write one JSON file per category
  const catLabels = {
    emissions:    'emissions_reductions',
    investments:  'investments_commitments',
    purchases:    'machine_purchases',
    pilots:       'pilot_projects',
    environments: 'environmental_constraints',
  };

  console.log(`\n💾 Writing output files to ${outputDir}/`);
  for (const [cat, label] of Object.entries(catLabels)) {
    const filename = join(outputDir, `${label}.json`);
    await writeFile(filename, JSON.stringify(categoryData[cat], null, 2), 'utf8');
    console.log(`   ✓ ${label}.json  (${categoryData[cat].length} entr${categoryData[cat].length === 1 ? 'y' : 'ies'})`);
  }

  console.log('\n✅ Done.\n');
}

main().catch(err => {
  console.error('\n❌ Fatal error:', err.message);
  process.exit(1);
});
