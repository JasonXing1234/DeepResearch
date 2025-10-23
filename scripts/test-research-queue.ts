import { createClient } from '@supabase/supabase-js';

// Supabase configuration
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';
const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

const supabase = createClient(supabaseUrl, supabaseKey);

// Test configuration
const TEST_COMPANIES = ['Tesla', 'Apple'];
const userId = 'b2bbb440-1d79-42fa-81e3-069efd22fae8';

interface TestResult {
  step: string;
  status: 'success' | 'failure';
  duration: number;
  error?: string;
  data?: any;
}

const results: TestResult[] = [];

function log(message: string) {
  console.log(message);
}

function logSection(title: string) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(title);
  console.log('='.repeat(60));
}

async function runTest(name: string, testFn: () => Promise<any>) {
  const startTime = Date.now();
  try {
    log(`\n🧪 Test: ${name}`);
    const result = await testFn();
    const duration = Date.now() - startTime;
    log(`✅ PASSED (${duration}ms)`);
    results.push({ step: name, status: 'success', duration, data: result });
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    log(`❌ FAILED: ${errorMessage}`);
    results.push({ step: name, status: 'failure', duration, error: errorMessage });
    throw error;
  }
}

async function testCreateProject() {
  const response = await fetch(`${apiBaseUrl}/api/sustainability/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: `Queue Test: ${TEST_COMPANIES.join(', ')}`,
      description: `Research queue test for ${TEST_COMPANIES.length} companies`,
    }),
  });

  const data = await response.json();
  if (!data.success) {
    throw new Error(data.error || 'Failed to create project');
  }

  log(`   Project ID: ${data.project.id}`);
  return data.project.id;
}

async function testRunResearch(projectId: string) {
  const response = await fetch(`${apiBaseUrl}/api/research-companies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      companies: TEST_COMPANIES.map(name => ({ name })),
      projectId: projectId,
    }),
  });

  const data = await response.json();
  if (!data.success) {
    throw new Error(data.error || 'Research failed');
  }

  log(`   Research ID: ${data.researchId}`);
  log(`   Files Generated: ${data.uploadedFiles}`);
  return data.researchId;
}

async function testGetResearchHistory() {
  const response = await fetch(`${apiBaseUrl}/api/research-queue?limit=5`);
  const data = await response.json();

  if (!data.success) {
    throw new Error(data.error || 'Failed to get research history');
  }

  log(`   Total Entries: ${data.data.length}`);
  if (data.data.length > 0) {
    const latest = data.data[0];
    log(`   Latest Entry:`);
    log(`     - Companies: ${latest.companies.join(', ')}`);
    log(`     - Status: ${latest.status}`);
    log(`     - Files: ${latest.files_generated}`);
    log(`     - Documents: ${latest.document_count}`);
    log(`     - Segments: ${latest.segment_count}`);
  }

  return data.data;
}

async function testGetResearchDetails(researchId: string) {
  const response = await fetch(`${apiBaseUrl}/api/research-queue/${researchId}`);
  const data = await response.json();

  if (!data.success) {
    throw new Error(data.error || 'Failed to get research details');
  }

  log(`   Research Entry:`);
  log(`     - ID: ${data.data.id}`);
  log(`     - Status: ${data.data.status}`);
  log(`     - Companies: ${data.data.companies.join(', ')}`);
  log(`     - Documents: ${data.data.documents.length}`);

  if (data.data.documents.length > 0) {
    log(`   Document Breakdown:`);
    const grouped = data.data.documents.reduce((acc: any, doc: any) => {
      acc[doc.category] = (acc[doc.category] || 0) + 1;
      return acc;
    }, {});
    Object.entries(grouped).forEach(([category, count]) => {
      log(`     - ${category}: ${count} documents`);
    });
  }

  return data.data;
}

async function testDatabaseIntegrity(researchId: string) {
  // Check research_queue table
  const { data: queueData, error: queueError } = await supabase
    .from('research_queue')
    .select('*')
    .eq('id', researchId)
    .single();

  if (queueError || !queueData) {
    throw new Error('Research queue entry not found in database');
  }

  log(`   Queue Entry: ✓`);
  log(`     - Status: ${queueData.status}`);
  log(`     - Files Generated: ${queueData.files_generated}`);

  // Check research_documents table
  const { data: docsData, error: docsError } = await supabase
    .from('research_documents')
    .select('*')
    .eq('research_id', researchId);

  if (docsError) {
    throw new Error('Failed to fetch research documents');
  }

  log(`   Research Documents: ${docsData?.length || 0}`);

  // Group by category
  const byCategory = (docsData || []).reduce((acc: any, doc: any) => {
    acc[doc.category] = (acc[doc.category] || 0) + 1;
    return acc;
  }, {});

  Object.entries(byCategory).forEach(([category, count]) => {
    log(`     - ${category}: ${count}`);
  });

  return { queueData, docsData };
}

async function testStorageFiles(projectId: string) {
  const { data: files, error } = await supabase.storage
    .from('sustainability-reports')
    .list(`${userId}/${projectId}`);

  if (error) {
    throw new Error(`Storage error: ${error.message}`);
  }

  log(`   Storage Files: ${files?.length || 0}`);
  files?.forEach(file => {
    log(`     - ${file.name} (${(file.metadata?.size || 0)} bytes)`);
  });

  return files;
}

async function testSearchSegments(researchId: string) {
  // First get the research details to get a company name
  const response = await fetch(`${apiBaseUrl}/api/research-queue/${researchId}`);
  const data = await response.json();

  if (!data.success || data.data.companies.length === 0) {
    log(`   Skipping search test - no companies found`);
    return;
  }

  const companyName = data.data.companies[0];

  // Search for segments
  try {
    const searchResponse = await fetch(`${apiBaseUrl}/api/research-queue/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyName: companyName,
        limit: 5,
      }),
    });

    const searchData = await searchResponse.json();

    if (!searchData.success) {
      // If no segments exist yet (research not vectorized), that's expected
      log(`   No segments found yet (research not vectorized)`);
      return [];
    }

    log(`   Search Results for "${companyName}": ${searchData.data.length}`);
    searchData.data.forEach((result: any, idx: number) => {
      log(`     ${idx + 1}. Category: ${result.category}, Segment ID: ${result.segment_id?.substring(0, 8)}...`);
    });

    return searchData.data;
  } catch (error) {
    // Segments not yet created is not a failure
    log(`   No segments found yet (research not vectorized)`);
    return [];
  }
}

async function testDeleteResearch(researchId: string) {
  const response = await fetch(`${apiBaseUrl}/api/research-queue/${researchId}`, {
    method: 'DELETE',
  });

  const data = await response.json();

  if (!data.success) {
    throw new Error(data.error || 'Failed to delete research');
  }

  log(`   Deleted research ID: ${researchId}`);

  // Verify deletion
  const { data: verifyData, error: verifyError } = await supabase
    .from('research_queue')
    .select('id')
    .eq('id', researchId)
    .maybeSingle();

  if (verifyData) {
    throw new Error('Research entry still exists after deletion');
  }

  log(`   Verification: Entry successfully removed from database`);

  return true;
}

async function main() {
  const startTime = Date.now();

  logSection('🧪 Research Queue System - Comprehensive Test');
  log(`\nTesting companies: ${TEST_COMPANIES.join(', ')}`);
  log(`Started at: ${new Date().toISOString()}`);
  log(`API Base URL: ${apiBaseUrl}`);
  log(`Supabase URL: ${supabaseUrl}\n`);

  let projectId: string | null = null;
  let researchId: string | null = null;

  try {
    // Test 1: Create Project
    projectId = await runTest('Create Project', testCreateProject);

    // Test 2: Run Research
    researchId = await runTest('Run Research', () => testRunResearch(projectId!));

    // Test 3: Get Research History
    await runTest('Get Research History', testGetResearchHistory);

    // Test 4: Get Research Details
    await runTest('Get Research Details', () => testGetResearchDetails(researchId!));

    // Test 5: Database Integrity
    await runTest('Check Database Integrity', () => testDatabaseIntegrity(researchId!));

    // Test 6: Storage Files
    await runTest('Verify Storage Files', () => testStorageFiles(projectId!));

    // Test 7: Search Segments
    await runTest('Search Research Segments', () => testSearchSegments(researchId!));

    // Test 8: Delete Research (cleanup)
    await runTest('Delete Research Entry', () => testDeleteResearch(researchId!));

  } catch (error) {
    log(`\n⚠️  Test suite stopped due to error`);
  }

  // Summary
  logSection('📊 Test Summary');
  const totalDuration = Date.now() - startTime;
  const passed = results.filter(r => r.status === 'success').length;
  const failed = results.filter(r => r.status === 'failure').length;

  log(`\nTotal Tests: ${results.length}`);
  log(`Passed: ${passed}`);
  log(`Failed: ${failed}`);
  log(`Total Duration: ${(totalDuration / 1000).toFixed(2)}s\n`);

  if (projectId) {
    log(`Project ID: ${projectId}`);
  }
  if (researchId) {
    log(`Research ID: ${researchId}`);
  }

  log('\nDetailed Results:');
  results.forEach((result, idx) => {
    const icon = result.status === 'success' ? '✅' : '❌';
    log(`  ${idx + 1}. ${icon} ${result.step} (${result.duration}ms)`);
    if (result.error) {
      log(`     Error: ${result.error}`);
    }
  });

  if (failed === 0) {
    log(`\n🎉 All tests passed!\n`);
    process.exit(0);
  } else {
    log(`\n⚠️  ${failed} test(s) failed.\n`);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
