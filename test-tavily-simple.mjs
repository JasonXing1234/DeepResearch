/**
 * Test script to demonstrate Tavily API input and output
 * Run this with: node test-tavily-simple.mjs
 */

import { readFileSync } from 'fs';

// Read API key from .env.local
function getApiKey() {
  try {
    const envContent = readFileSync('.env.local', 'utf-8');
    const match = envContent.match(/TAVILY_API_KEY=(.+)/);
    return match ? match[1].trim() : null;
  } catch (error) {
    return null;
  }
}

async function testTavilyAPI() {
  const apiKey = getApiKey();

  if (!apiKey) {
    console.error('❌ TAVILY_API_KEY not found in .env.local file');
    process.exit(1);
  }

  // Example query - you can change this
  const exampleQuery = 'Microsoft carbon emissions reduction commitment net zero 2024';

  const requestPayload = {
    api_key: apiKey,
    query: exampleQuery,
    search_depth: 'advanced',
    max_results: 5,
    include_domains: [],
    exclude_domains: [],
  };

  console.log('\n=================================================');
  console.log('📤 TAVILY API REQUEST (INPUT)');
  console.log('=================================================\n');
  console.log('URL: https://api.tavily.com/search');
  console.log('Method: POST');
  console.log('Headers: { "Content-Type": "application/json" }\n');
  console.log('Body:');
  // Hide the API key in the display
  const displayPayload = { ...requestPayload, api_key: 'tvly-**********************' };
  console.log(JSON.stringify(displayPayload, null, 2));
  console.log('\n=================================================\n');

  try {
    console.log('⏳ Making API call to Tavily...\n');

    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestPayload),
    });

    if (!response.ok) {
      console.error(`❌ Tavily API error: ${response.status} ${response.statusText}`);
      const errorText = await response.text();
      console.error('Error details:', errorText);
      process.exit(1);
    }

    const data = await response.json();

    console.log('=================================================');
    console.log('📥 TAVILY API RESPONSE (OUTPUT)');
    console.log('=================================================\n');
    console.log('Status: 200 OK');
    console.log('\nRaw JSON Response:');
    console.log(JSON.stringify(data, null, 2));
    console.log('\n=================================================\n');

    // Pretty print summary
    console.log('📊 SUMMARY:');
    console.log(`- Query: "${exampleQuery}"`);
    console.log(`- Results returned: ${data.results?.length || 0}`);
    console.log(`- Response time: ${data.response_time || 'N/A'} seconds`);

    if (data.results && data.results.length > 0) {
      console.log('\n📝 First Result Preview:');
      console.log(`- Title: ${data.results[0].title}`);
      console.log(`- URL: ${data.results[0].url}`);
      console.log(`- Content (first 200 chars): ${data.results[0].content?.substring(0, 200)}...`);
    }

    console.log('\n✅ Success! You can now take screenshots of the input and output above.');
    console.log('\n💡 Tip: Scroll up to capture both the REQUEST and RESPONSE sections.');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Run the test
testTavilyAPI();
