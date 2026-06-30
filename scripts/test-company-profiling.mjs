#!/usr/bin/env node
/**
 * test-company-profiling.mjs
 * Research and profile companies using Nova web grounding.
 *
 * Usage:
 *   node scripts/test-company-profiling.mjs
 *   node scripts/test-company-profiling.mjs --output ./output/my-run
 *   node scripts/test-company-profiling.mjs --model amazon.nova-premier-v1:0
 *
 * Output:
 *   output/company-profiling/company_profiles.json   — structured per-company profiles
 *   output/company-profiling/company_profiles.md     — human-readable table
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

const outputDir  = resolve(args.output || './output/company-profiling');
const rawModelId = args.model || process.env.BEDROCK_RESEARCH_MODEL_ID || 'amazon.nova-premier-v1:0';
const modelId    = /^(us|eu|ap)\./.test(rawModelId) ? rawModelId : `us.${rawModelId}`;
const region     = args.region || process.env.AWS_REGION || 'us-east-1';

// ── Company definitions ───────────────────────────────────────────────────────

const COMPANIES = [
  {
    name:     'Constructo Tripoloni (Tripoloni Construction)',
    location: 'Sao Paulo, Brazil',
    dealer:   'PESA',
    searchNames: ['Constructo Tripoloni', 'Tripoloni Construction', 'Tripoloni construtora'],
  },
  {
    name:     'CLC (Construtora Luiz Costa)',
    location: 'Juazeiro, Brazil',
    dealer:   'Sotreq',
    searchNames: ['Construtora Luiz Costa', 'CLC Construtora', 'CLC Juazeiro'],
  },
];

// ── Bedrock client ────────────────────────────────────────────────────────────

const client = new BedrockRuntimeClient({ region });

console.log(`\n🏗️  Company Profiling Research`);
console.log(`   Model   : ${modelId}`);
console.log(`   Region  : ${region}`);
console.log(`   Output  : ${outputDir}\n`);

// ── Utilities ─────────────────────────────────────────────────────────────────

function stripThinking(text) {
  if (!text) return '';
  return text
    .replace(/<thinking[^>]*>[\s\S]*?<\/thinking>/gi, '')
    .replace(/<thinking[^>]*>[\s\S]*/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// extractNovaResults: for SEARCH queries — only use cited web snippets to avoid hallucination.
function extractNovaResults(response) {
  const contentItems = response?.output?.message?.content || [];
  const raw = [];

  // Nova interleaves `text` and `citationsContent` items. The `text` segment
  // immediately preceding a `citationsContent` block is the grounded excerpt
  // for those cited URLs (sourceContent is absent in this API version).
  let lastText = '';
  for (const item of contentItems) {
    if (typeof item?.text === 'string') {
      lastText = stripThinking(item.text);
      continue;
    }
    const citations = item?.citationsContent?.citations || [];
    if (citations.length > 0) {
      const snippet = lastText;
      lastText = '';
      for (const citation of citations) {
        const url = citation?.location?.web?.url;
        if (!url || !url.startsWith('http')) continue;
        const title = citation?.location?.web?.title || citation?.location?.web?.domain || url;
        const fallbackSnippet = citation?.sourceContent?.text ||
                                citation?.generatedResponsePart?.textResponsePart?.text || '';
        raw.push({ title, url, snippet: snippet || stripThinking(fallbackSnippet) });
      }
    }
  }

  // Deduplicate by URL, keeping the longest snippet per URL
  const byUrl = new Map();
  for (const item of raw) {
    const existing = byUrl.get(item.url);
    if (!existing || item.snippet.length > existing.snippet.length) byUrl.set(item.url, item);
  }
  return [...byUrl.values()];
}

// extractNovaBrowseResults: for explicit URL reads — also capture uncited answer text and
// attribute it to the target URL. When we ask Nova to read a specific page, its text response
// IS grounded in that page even if Nova omits the back-citation.
function extractNovaBrowseResults(response, targetUrl) {
  const contentItems = response?.output?.message?.content || [];
  const raw = [];
  let answerText = '';

  let lastText = '';
  for (const item of contentItems) {
    if (typeof item?.text === 'string') {
      lastText = stripThinking(item.text);
      answerText += ' ' + lastText;
      continue;
    }
    const citations = item?.citationsContent?.citations || [];
    if (citations.length > 0) {
      const snippet = lastText;
      lastText = '';
      for (const citation of citations) {
        const url = citation?.location?.web?.url;
        if (!url || !url.startsWith('http')) continue;
        const title = citation?.location?.web?.title || citation?.location?.web?.domain || url;
        const fallbackSnippet = citation?.sourceContent?.text ||
                                citation?.generatedResponsePart?.textResponsePart?.text || '';
        raw.push({ title, url, snippet: snippet || stripThinking(fallbackSnippet) });
      }
    }
  }

  // Only attribute answer text to targetUrl when there are NO other citations.
  // If Nova cited any other URLs, the answer is a synthesis of those sources — we
  // use those citations directly and don't risk attributing hallucinated text to the
  // target URL (which may be a 404 or JavaScript-only page Nova couldn't read).
  const hasTargetCitation = raw.some(r => r.url === targetUrl || r.url.startsWith(targetUrl.replace(/\/$/, '')));
  const cleanAnswer = answerText.trim();
  const PAGE_FAIL = /\b(404|page not found|not found|couldn'?t (access|load|find|retrieve)|unable to (access|load|find|retrieve)|does not exist|no longer (available|exists)|error (loading|accessing))\b/i;
  const noOtherSources = raw.length === 0;
  if (!hasTargetCitation && noOtherSources && cleanAnswer.length > 100 && !PAGE_FAIL.test(cleanAnswer)) {
    const domain = (() => { try { return new URL(targetUrl).hostname; } catch { return targetUrl; } })();
    raw.push({ title: domain, url: targetUrl, snippet: cleanAnswer });
  }

  // Deduplicate by URL, keeping the longest snippet per URL
  const byUrl = new Map();
  for (const item of raw) {
    const existing = byUrl.get(item.url);
    if (!existing || item.snippet.length > existing.snippet.length) byUrl.set(item.url, item);
  }
  return [...byUrl.values()];
}

async function novaSearch(query, systemPrompt) {
  process.stdout.write(`  → ${query.slice(0, 90)}… `);
  try {
    const cmd = new ConverseCommand({
      modelId,
      messages: [{ role: 'user', content: [{ text:
        `Search the web thoroughly for the following. Read the full content of every relevant page you find — including official company websites, LinkedIn profiles, government records, news articles, and local business directories. Extract and report ALL specific details you find: company description, services, projects (with names, locations, dates), people (names and titles), equipment/fleet, and any other relevant information. Be as detailed as possible.\n\nQuery: ${query}`
      }] }],
      system: [{ text: systemPrompt }],
      toolConfig: { tools: [{ systemTool: { name: 'nova_grounding' } }] },
      inferenceConfig: { maxTokens: 3000 },
    });
    const resp    = await client.send(cmd);
    const results = extractNovaResults(resp);
    console.log(`✓ ${results.length} result(s)`);
    return results;
  } catch (err) {
    console.log(`✗ ${err.message?.slice(0, 60)}`);
    return [];
  }
}

// Ask Nova to deeply read a specific URL and extract everything about the company
async function novaBrowseUrl(url, company, systemPrompt) {
  process.stdout.write(`  📖 Reading ${url.slice(0, 75)}… `);
  try {
    const cmd = new ConverseCommand({
      modelId,
      messages: [{ role: 'user', content: [{ text:
        `Please visit and read the full content of this page: ${url}\n\nExtract and report EVERYTHING you find about "${company.name}" — including: what the company does, all projects mentioned (names, locations, dates, their role), all people named (with titles), any equipment or fleet information, any challenges mentioned, and any technology tools they use. Report all details in English, translating from Portuguese if needed. Be exhaustive.`
      }] }],
      system: [{ text: systemPrompt }],
      toolConfig: { tools: [{ systemTool: { name: 'nova_grounding' } }] },
      inferenceConfig: { maxTokens: 3000 },
    });
    const resp    = await client.send(cmd);
    const results = extractNovaBrowseResults(resp, url);
    console.log(`✓ ${results.length} result(s)`);
    return results;
  } catch (err) {
    console.log(`✗ ${err.message?.slice(0, 60)}`);
    return [];
  }
}

// Only keep snippets that actually mention the company (by any significant alias keyword).
// Also accepts results whose URL itself contains a company keyword (official site pages
// often don't repeat the company name in their page text).
function filterRelevantResults(results, company) {
  const STOP = new Set(['the', 'and', 'or', 'in', 'of', 'a', 'an', 'for', 'by', 'at',
                        // Common company suffixes (any language)
                        'inc', 'corp', 'co', 'llc', 'ltd', 'group', 'sa', 'srl', 'bv', 'gmbh',
                        // Portuguese
                        'de', 'do', 'da', 'e', 'em', 'no', 'na',
                        // Spanish
                        'el', 'la', 'los', 'las', 'del', 'y',
                        // French
                        'le', 'les', 'des', 'du', 'et']);
  const keywords = [...new Set(
    company.searchNames.flatMap(n =>
      n.toLowerCase().split(/\s+/).filter(w => w.length > 2 && !STOP.has(w))
    )
  )];
  return results.filter(r => {
    const urlLower = r.url.toLowerCase();
    const haystack = `${r.title} ${r.snippet}`.toLowerCase();
    return keywords.some(kw => urlLower.includes(kw) || haystack.includes(kw));
  });
}

function fullText(results) {
  const seen = new Set();
  return results
    .map(r => r.snippet || '')
    .filter(t => { if (!t || seen.has(t)) return false; seen.add(t); return true; })
    .join('\n\n');
}

function allUrls(results) {
  return [...new Set(results.map(r => r.url).filter(Boolean))];
}

// ── Fetch full page text from a URL ──────────────────────────────────────────

async function fetchPageText(url, maxLen = 6000) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; research-bot/1.0)' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return '';
    const html = await res.text();
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/\s+/g, ' ').trim()
      .slice(0, maxLen);
  } catch { return ''; }
}

// ── Ask Nova to identify the official website and explore it ─────────────────
async function discoverAndBrowseOfficialSite(company, pass1Results, systemPrompt) {
  // Ask Nova to find the official site — either from what we already found, or by searching
  process.stdout.write(`  🔍 Identifying official website… `);
  let officialSiteUrl = null;
  try {
    const cmd = new ConverseCommand({
      modelId,
      messages: [{ role: 'user', content: [{ text:
        `${company.searchNames[0]} ${company.location} construction company official website. ` +
        `What is the official website URL of this company? ` +
        `Reply with ONLY the full URL (e.g. https://example.com.br). ` +
        `If you cannot find one, reply: none`
      }] }],
      system: [{ text: systemPrompt }],
      toolConfig: { tools: [{ systemTool: { name: 'nova_grounding' } }] },
      inferenceConfig: { maxTokens: 200 },
    });
    const resp = await client.send(cmd);
    // Collect ALL text items (not just the last one before a citation)
    const allText = (resp?.output?.message?.content || [])
      .filter(i => typeof i?.text === 'string')
      .map(i => stripThinking(i.text))
      .join(' ')
      .trim();

    const urlMatch = allText.match(/https?:\/\/[^\s"',<>)]+/);
    // Also handle bare domain like "www.example.com.br" returned without https://
    const bareMatch = !urlMatch && allText.match(/www\.[a-z0-9-]+(?:\.[a-z0-9-]+)+/i);
    const notNone = !allText.replace(/\s/g,'').toLowerCase().startsWith('none');
    if (urlMatch && notNone) {
      try {
        const parsed = new URL(urlMatch[0].replace(/[.,;)]+$/, ''));
        officialSiteUrl = `${parsed.protocol}//${parsed.host}`;
      } catch { /* malformed URL */ }
    } else if (bareMatch && notNone) {
      try {
        const parsed = new URL(`https://${bareMatch[0].replace(/[.,;)]+$/, '')}`);
        officialSiteUrl = `${parsed.protocol}//${parsed.host}`;
      } catch { /* malformed */ }
    }
    console.log(officialSiteUrl ? `✓ ${officialSiteUrl}` : 'not found');
  } catch {
    console.log('(error)');
  }

  if (!officialSiteUrl) return [];

  // Browse the official site root page
  const browseResults = [];
  const rootResults = await novaBrowseUrl(officialSiteUrl, company, systemPrompt);
  browseResults.push(...rootResults);

  // Ask Nova to find the projects/portfolio page on that site
  process.stdout.write(`  🔍 Finding projects page… `);
  let projectsPageUrl = null;
  try {
    const cmd = new ConverseCommand({
      modelId,
      messages: [{ role: 'user', content: [{ text:
        `Visit ${officialSiteUrl} and find the URL for their projects or portfolio page. ` +
        `Reply with ONLY the full URL. If there is no such page, reply: none`
      }] }],
      system: [{ text: systemPrompt }],
      toolConfig: { tools: [{ systemTool: { name: 'nova_grounding' } }] },
      inferenceConfig: { maxTokens: 200 },
    });
    const resp = await client.send(cmd);
    const allText = (resp?.output?.message?.content || [])
      .filter(i => typeof i?.text === 'string')
      .map(i => stripThinking(i.text))
      .join(' ')
      .trim();
    const urlMatch = allText.match(/https?:\/\/[^\s"',<>)]+/);
    if (urlMatch && !allText.toLowerCase().startsWith('none')) {
      try {
        projectsPageUrl = urlMatch[0].replace(/[.,;]+$/, '');
      } catch { /* malformed */ }
    }
    console.log(projectsPageUrl ? `✓ ${projectsPageUrl}` : 'not found');
  } catch {
    console.log('(error)');
  }

  if (projectsPageUrl && projectsPageUrl !== officialSiteUrl) {
    const projResults = await novaBrowseUrl(projectsPageUrl, company, systemPrompt);
    browseResults.push(...projResults);
  }

  return browseResults;
}


// High score = company's own site, news about them, gov contracts
// Low score = generic directories, off-topic pages
function scoreUrl(url, company) {
  const u = url.toLowerCase();
  const keywords = company.searchNames.flatMap(n =>
    n.toLowerCase().split(/\s+/).filter(w => w.length > 3)
  );
  let score = 0;
  if (keywords.some(kw => u.includes(kw))) score += 10;
  // Extra boost for pages on the company's own domain (highest-value source)
  const domainPart = u.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
  if (keywords.some(kw => domainPart.includes(kw))) score += 15;
  if (u.includes('linkedin.com/company') || u.includes('devex.com') || u.includes('kompass.com')) score += 4;
  if (u.includes('escavador.com') || u.includes('jusbrasil.com') || u.includes('cnpj')) score += 3;
  // Penalise clearly off-topic
  if (u.includes('parts.cat.com') || u.includes('careers.cat') || u.includes('mercadolivre') ||
      u.includes('wikipedia') || u.includes('reverso.net') || u.includes('scribd') ||
      u.includes('volvoce.com') || u.includes('researchgate') || u.includes('avesco') ||
      u.includes('carolinacat') || u.includes('toromontcat') || u.includes('thompsontractor')) score -= 10;
  return score;
}

// ── Search queries — language-agnostic, topic-driven ─────────────────────────
// Queries describe *what to find* in English. Nova resolves language from location context.

function queries(company) {
  const n = company.searchNames;
  const primaryName = n[0];
  const altNames    = n.slice(1).map(a => `"${a}"`).join(' OR ');
  const loc         = company.location;

  return [
    // Broad profile
    `"${primaryName}" ${loc} construction company profile services projects`,
    // Alt names
    altNames ? `(${altNames}) ${loc} construction company profile projects` : null,
    // Projects and contracts
    `"${primaryName}" construction projects contracts infrastructure`,
    // People
    `"${primaryName}" founders directors engineers leadership team`,
    // Equipment and fleet management
    `"${primaryName}" equipment fleet Caterpillar VisionLink dealer ${company.dealer}`,
    // Official website
    `"${primaryName}" official website`,
  ].filter(Boolean);
}

// ── Nova extraction (no grounding) ───────────────────────────────────────────

async function extractWithNova(company, dimension, researchText, sourceUrls) {
  if (!researchText.trim()) return null;

  const schemas = {
    industry: `{
  "INDUSTRY": "<primary industry/industries served, e.g. heavy civil construction, road building, earthmoving>",
  "USE_CASES": "<likely Caterpillar equipment use cases based on their work, e.g. earthmoving, paving, site prep. State 'Use case not specified publicly' if cannot infer>",
  "DESCRIPTION": "<2-4 sentence summary of what the company does>"
}`,
    projects: `[{
  "PROJECT_NAME": "<name or description>",
  "ROLE": "<contractor / partner / subcontractor / owner — if known>",
  "STATUS": "<past / current / announced>",
  "DESCRIPTION": "<brief description>",
  "SOURCE": "<url>"
}]`,
    people: `[{
  "NAME": "<person's full name>",
  "TITLE": "<title or role>",
  "SOURCE": "<url>"
}]`,
    fleet: `[{
  "MANUFACTURER": "<e.g. Caterpillar, Komatsu, Volvo, John Deere>",
  "MODEL": "<model number/name if known>",
  "MACHINE_TYPE": "<e.g. excavator, motor grader, dozer, wheel loader>",
  "QUANTITY": "<number of units if known>",
  "USAGE": "<what this machine is used for>",
  "SOURCE": "<url>"
}]`,
    challenges: `[{
  "CHALLENGE": "<description of the challenge>",
  "CONTEXT": "<internal operational challenge or challenge they help customers solve>",
  "SOURCE": "<url>"
}]`,
    visionlink: `{
  "USES_VISIONLINK": "<yes / no / unverified>",
  "DETAILS": "<how they use VisionLink or VisionLink Productivity>",
  "WORKFLOW_IMPACT": "<any reported workflow changes or measurable impacts>",
  "SOURCE": "<url or 'Not found'>"
}`,
  };

  const instructions = {
    industry:   'Extract the company\'s primary business sector, the types of work they do, and likely equipment use cases based on their described services and projects. Only infer use cases directly supported by their work; otherwise state "Use case not specified publicly."',
    projects:   'Extract ALL past, current, and announced projects — regardless of time period. Include role (contractor/partner/sub) if mentioned. Do not fabricate projects.',
    people:     'Extract names and titles of owners, executives, directors, engineers, or any publicly listed staff. Only include people explicitly named in the source text.',
    fleet:      'Extract ALL equipment (any manufacturer) they own or operate. Include Caterpillar and competitor equipment. Note usage context for each machine. IMPORTANT: Only include a machine if the exact model number or machine type is stated verbatim in the source text. Do not infer or guess typical equipment for this type of company.',
    challenges: 'Extract any challenges the company has reported — operational difficulties, site conditions, productivity issues, or challenges they help customers address.',
    visionlink: 'Look specifically for mentions of VisionLink, VisionLink Productivity, Cat telematics, fleet management software, or similar tools. Report if not found.',
  };

  const prompt = `You are a data extraction assistant. Extract structured information about "${company.name}" (${company.location}) from the research text below.

IMPORTANT: All output must be in English. Translate any Portuguese content to English.

TASK: Extract "${dimension}" information.
INSTRUCTIONS: ${instructions[dimension]}

RULES:
- ALL output text must be in English — translate from Portuguese if needed.
- Use ONLY information explicitly stated in the research text — do NOT invent or infer beyond what is written.
- Use ONLY source URLs from the Available URLs list below. Do NOT add URLs not in that list.
- If no relevant information is found for THIS specific company, return null (not an empty record, not generic industry info).
- Every record must be grounded in text that directly mentions "${company.name}" or one of its known aliases: ${company.searchNames.join(', ')}. Generic industry articles about Brazil's construction sector do NOT count.
- Use public sources only. Do not reference any internal Caterpillar data.
- ANTI-HALLUCINATION: Do NOT invent specific machine models, project names, or people. If a detail is not explicitly stated in the research text, omit it entirely rather than guessing.

Output ONLY valid JSON matching this schema:
${schemas[dimension]}

Available URLs:
${sourceUrls.join('\n') || '(none)'}

Research text:
---
${researchText.slice(0, 8000)}
---

Respond with ONLY the JSON in English. If nothing specific to this company is found, return null.`;

  try {
    const cmd = new ConverseCommand({
      modelId,
      messages: [{ role: 'user', content: [{ text: prompt }] }],
      system:   [{ text: 'You are a precise JSON data extractor. Output only valid JSON in English. No markdown fences, no explanatory text. Translate any Portuguese content to English.' }],
      inferenceConfig: { maxTokens: 2048, temperature: 0 },
    });
    const resp    = await client.send(cmd);
    const rawText = resp?.output?.message?.content
      ?.filter(c => typeof c?.text === 'string')
      ?.map(c => c.text)
      ?.join('') || '';
    const clean = stripThinking(rawText).trim();

    // Strip markdown fences if present
    const stripped = clean.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();

    if (!stripped) return null;

    // Try to extract a JSON array or object — handles cases where Nova adds trailing text after valid JSON
    const arrStart = stripped.indexOf('[');
    const objStart = stripped.indexOf('{');
    const nullIdx  = stripped.toLowerCase().indexOf('null');

    // Prefer array > object > null
    if (arrStart !== -1 && (objStart === -1 || arrStart < objStart) && (nullIdx === -1 || arrStart < nullIdx)) {
      const arrEnd = stripped.lastIndexOf(']');
      if (arrEnd > arrStart) return JSON.parse(stripped.slice(arrStart, arrEnd + 1));
    }
    if (objStart !== -1 && (arrStart === -1 || objStart < arrStart) && (nullIdx === -1 || objStart < nullIdx)) {
      const objEnd = stripped.lastIndexOf('}');
      if (objEnd > objStart) return JSON.parse(stripped.slice(objStart, objEnd + 1));
    }
    if (nullIdx !== -1) return null;

    return JSON.parse(stripped);
  } catch (err) {
    console.warn(`    ⚠  Extraction failed for ${dimension}: ${err.message?.slice(0, 80)}`);
    return null;
  }
}

async function researchCompany(company) {
  console.log(`\n📋 Researching: ${company.name} (${company.location})`);
  console.log(`   Dealer: ${company.dealer}`);

  const systemPrompt = `You are researching a construction company named "${company.name}" located in ${company.location}.
Use ONLY publicly available online sources. Search in the local language of ${company.location} as well as English.
Be thorough — read the full content of official company websites, LinkedIn profiles, government portals, news, and business directories.
Report every specific detail you find: services, projects (with names/locations/dates), people (names and titles), equipment, and any other relevant facts.`;

  // ── Pass 1: keyword searches to discover URLs ─────────────────────────────
  console.log(`\n  🌐 Pass 1 — keyword searches to discover sources…`);
  const searchResultArrays = await Promise.all(queries(company).map(q => novaSearch(q, systemPrompt)));
  const rawResults = searchResultArrays.flat();

  const seenPass1 = new Set();
  const pass1Results = rawResults.filter(r => {
    if (seenPass1.has(r.url)) return false;
    seenPass1.add(r.url);
    return true;
  });

  // ── Pass 2: deep-read top-scored pages from search results ───────────────
  const rankedUrls = allUrls(pass1Results)
    .map(url => ({ url, score: scoreUrl(url, company) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map(({ url }) => url);

  console.log(`\n  📖 Pass 2 — deep-reading ${rankedUrls.length} top-ranked URL(s)…`);
  const pass2Results = [];
  for (const url of rankedUrls) {
    const r = await novaBrowseUrl(url, company, systemPrompt);
    pass2Results.push(...r);
  }

  // ── Pass 3: discover + browse the official company website ────────────────
  console.log(`\n  🌐 Pass 3 — official site discovery…`);
  const allSoFar = [...pass1Results, ...pass2Results];
  const pass3Results = await discoverAndBrowseOfficialSite(company, allSoFar, systemPrompt);

  // ── Merge and deduplicate all results ─────────────────────────────────────
  const seenAll = new Set();
  const allResults = [...pass1Results, ...pass2Results, ...pass3Results].filter(r => {
    if (seenAll.has(r.url)) return false;
    seenAll.add(r.url);
    return true;
  });

  const combinedText = fullText(allResults);
  const allSourceUrls = allUrls(allResults);
  console.log(`\n  combined: ${combinedText.length} chars from ${allSourceUrls.length} sources`);

  // ── Extract all dimensions ─────────────────────────────────────────────────
  console.log(`\n  🔍 Extracting structured data…`);
  const DIMENSIONS = ['industry', 'projects', 'people', 'fleet', 'challenges', 'visionlink'];
  const extracted = {};
  await Promise.all(DIMENSIONS.map(async dim => {
    process.stdout.write(`     ${dim.padEnd(12)} `);
    if (!combinedText.trim()) { console.log('(no content)'); extracted[dim] = null; return; }
    const data = await extractWithNova(company, dim, combinedText, allSourceUrls);
    console.log(data ? '✓' : '(not found)');
    extracted[dim] = data;
  }));

  return {
    NAME:              company.name,
    LOCATION:          company.location,
    CAT_DEALER:        company.dealer,
    INDUSTRY:          extracted.industry   || { INDUSTRY: 'Not found', USE_CASES: 'Not found', DESCRIPTION: 'Not found' },
    PROJECTS:          extracted.projects   || [],
    PEOPLE:            extracted.people     || [],
    FLEET_INFORMATION: extracted.fleet      || [],
    CHALLENGES:        extracted.challenges || [],
    VISIONLINK:        extracted.visionlink || { USES_VISIONLINK: 'Not found', DETAILS: 'Not found', WORKFLOW_IMPACT: 'Not found', SOURCE: 'Not found' },
    COMMENTS:          `Cat dealer: ${company.dealer}. Searched in Portuguese and English. URLs deep-read: ${rankedUrls.join(', ')}`,
    SOURCES:           allSourceUrls,
  };
}

// ── Markdown table formatter ──────────────────────────────────────────────────

function toMarkdown(profiles) {
  const lines = [];
  lines.push('# Company Profiling Research Results\n');
  lines.push(`_Generated: ${new Date().toISOString()}_\n`);

  for (const p of profiles) {
    lines.push(`---\n\n## ${p.NAME}`);
    lines.push(`**Location:** ${p.LOCATION}  |  **Cat Dealer:** ${p.CAT_DEALER}\n`);

    // Industry
    lines.push('### Industry & Work');
    const ind = p.INDUSTRY;
    if (ind && (ind.DESCRIPTION || ind.INDUSTRY || ind.USE_CASES)) {
      if (ind.DESCRIPTION) lines.push(ind.DESCRIPTION);
      if (ind.INDUSTRY)    lines.push(`\n**Industry:** ${ind.INDUSTRY}`);
      if (ind.USE_CASES)   lines.push(`**Use Cases:** ${ind.USE_CASES}`);
    } else {
      lines.push('Not found');
    }

    // Projects
    lines.push('\n### Projects');
    if (p.PROJECTS?.length > 0) {
      for (const proj of p.PROJECTS) {
        const role   = proj.ROLE   ? ` [${proj.ROLE}]` : '';
        const status = proj.STATUS ? ` (${proj.STATUS})` : '';
        lines.push(`- **${proj.PROJECT_NAME || 'Unnamed project'}**${role}${status}: ${proj.DESCRIPTION || ''}`);
        if (proj.SOURCE && !proj.SOURCE.startsWith('https://search.nova')) lines.push(`  _Source: ${proj.SOURCE}_`);
      }
    } else {
      lines.push('Not found');
    }

    // People
    lines.push('\n### People');
    if (p.PEOPLE?.length > 0) {
      for (const person of p.PEOPLE) {
        lines.push(`- **${person.NAME}** — ${person.TITLE || 'Unknown role'}`);
      }
    } else {
      lines.push('Not found');
    }

    // Fleet
    lines.push('\n### Fleet Information');
    if (p.FLEET_INFORMATION?.length > 0) {
      for (const machine of p.FLEET_INFORMATION) {
        const qty   = machine.QUANTITY ? ` (${machine.QUANTITY} units)` : '';
        const model = machine.MODEL    ? ` ${machine.MODEL}` : '';
        lines.push(`- **${machine.MANUFACTURER}**${model} ${machine.MACHINE_TYPE}${qty}: ${machine.USAGE || ''}`);
        if (machine.SOURCE && !machine.SOURCE.startsWith('https://search.nova')) lines.push(`  _Source: ${machine.SOURCE}_`);
      }
    } else {
      lines.push('Not found');
    }

    // Challenges
    lines.push('\n### Challenges');
    if (p.CHALLENGES?.length > 0) {
      for (const ch of p.CHALLENGES) {
        lines.push(`- ${ch.CHALLENGE || ch}`);
        if (ch.CONTEXT) lines.push(`  _Context: ${ch.CONTEXT}_`);
      }
    } else {
      lines.push('Not found');
    }

    // VisionLink
    lines.push('\n### VisionLink');
    if (p.VISIONLINK) {
      lines.push(`**Uses VisionLink:** ${p.VISIONLINK.USES_VISIONLINK || 'Not found'}`);
      if (p.VISIONLINK.DETAILS) lines.push(`**Details:** ${p.VISIONLINK.DETAILS}`);
      if (p.VISIONLINK.WORKFLOW_IMPACT) lines.push(`**Workflow Impact:** ${p.VISIONLINK.WORKFLOW_IMPACT}`);
    } else {
      lines.push('Not found');
    }

    // Sources
    lines.push('\n### Sources');
    if (p.SOURCES?.length > 0) {
      for (const url of p.SOURCES.slice(0, 20)) {
        lines.push(`- ${url}`);
      }
    } else {
      lines.push('No public sources found');
    }

    lines.push('');
  }

  return lines.join('\n');
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  await mkdir(outputDir, { recursive: true });

  const profiles = [];
  for (const company of COMPANIES) {
    const profile = await researchCompany(company);
    profiles.push(profile);
  }

  // Write JSON
  const jsonPath = join(outputDir, 'company_profiles.json');
  await writeFile(jsonPath, JSON.stringify(profiles, null, 2), 'utf8');
  console.log(`\n💾 ${jsonPath}`);

  // Write Markdown
  const mdPath = join(outputDir, 'company_profiles.md');
  await writeFile(mdPath, toMarkdown(profiles), 'utf8');
  console.log(`💾 ${mdPath}`);

  console.log('\n✅ Done.\n');
}

main().catch(err => {
  console.error('\n❌ Fatal error:', err.message);
  process.exit(1);
});
