








const TEST_COMPANIES = [
  'BASF',
  'Vulcan Materials',
  'Ziegler CAT',
  'Harsco Metals Group',
];

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

interface TestResult {
  step: string;
  success: boolean;
  data?: any;
  error?: string;
  duration?: number;
}

const results: TestResult[] = [];

function log(message: string) {
  console.log(message);
}

function logSection(title: string) {
  console.log('\n' + '='.repeat(60));
  console.log(title);
  console.log('='.repeat(60) + '\n');
}

async function testCreateProject(): Promise<string | null> {
  const startTime = Date.now();
  log('📝 Step 1: Creating project...');

  try {
    const response = await fetch(`${API_BASE_URL}/api/sustainability/projects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: `Test Research: ${TEST_COMPANIES.join(', ')}`,
        description: `Manual test for researching 4 companies - ${new Date().toISOString()}`,
      }),
    });

    const data = await response.json();
    const duration = Date.now() - startTime;

    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Failed to create project');
    }

    log(`✅ Project created successfully (${duration}ms)`);
    log(`   Project ID: ${data.project.id}`);
    log(`   Project Name: ${data.project.name}\n`);

    results.push({
      step: 'Create Project',
      success: true,
      data: data.project,
      duration,
    });

    return data.project.id;
  } catch (error: any) {
    log(`❌ Failed to create project: ${error.message}\n`);
    results.push({
      step: 'Create Project',
      success: false,
      error: error.message,
    });
    return null;
  }
}

async function testResearchCompanies(projectId: string): Promise<boolean> {
  const startTime = Date.now();
  log('🔍 Step 2: Researching companies...');
  log(`   Companies: ${TEST_COMPANIES.join(', ')}`);
  log('   This may take 2-5 minutes...\n');

  try {
    const response = await fetch(`${API_BASE_URL}/api/research-companies`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        companies: TEST_COMPANIES.map((name) => ({ name })),
        projectId: projectId,
      }),
    });

    const data = await response.json();
    const duration = Date.now() - startTime;

    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Research failed');
    }

    log(`✅ Research completed successfully (${(duration / 1000).toFixed(2)}s)`);
    log(`   Files Generated: ${data.uploadedFiles}`);
    log(`   Message: ${data.message}\n`);

    results.push({
      step: 'Research Companies',
      success: true,
      data: data,
      duration,
    });

    return true;
  } catch (error: any) {
    log(`❌ Research failed: ${error.message}\n`);
    results.push({
      step: 'Research Companies',
      success: false,
      error: error.message,
    });
    return false;
  }
}

async function testVerifyProject(projectId: string): Promise<boolean> {
  const startTime = Date.now();
  log('📂 Step 3: Verifying project updates...');

  try {
    const response = await fetch(
      `${API_BASE_URL}/api/sustainability/projects?id=${projectId}`
    );

    const data = await response.json();
    const duration = Date.now() - startTime;

    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Failed to fetch project');
    }

    const project = data.project;

    log(`✅ Project verified (${duration}ms)`);

    const fileTypes = [
      'emissions_file_id',
      'investments_file_id',
      'machine_purchases_file_id',
      'pilot_projects_file_id',
      'project_environments_file_id',
    ];

    let uploadedCount = 0;
    fileTypes.forEach((fileType) => {
      if (project[fileType]) {
        uploadedCount++;
        log(`   ✓ ${fileType}: ${project[fileType]}`);
      } else {
        log(`   ✗ ${fileType}: NOT UPLOADED`);
      }
    });

    log(`\n   Total Files Uploaded: ${uploadedCount}/5\n`);

    results.push({
      step: 'Verify Project',
      success: uploadedCount === 5,
      data: { uploadedCount, project },
      duration,
    });

    return uploadedCount === 5;
  } catch (error: any) {
    log(`❌ Verification failed: ${error.message}\n`);
    results.push({
      step: 'Verify Project',
      success: false,
      error: error.message,
    });
    return false;
  }
}

async function testVerifyFiles(projectId: string): Promise<boolean> {
  const startTime = Date.now();
  log('💾 Step 4: Verifying database records...');

  try {
    const response = await fetch(
      `${API_BASE_URL}/api/sustainability/files?projectId=${projectId}`
    );

    const data = await response.json();
    const duration = Date.now() - startTime;

    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Failed to fetch files');
    }

    log(`✅ Database records verified (${duration}ms)`);
    log(`   Total Records: ${data.files.length}`);

    data.files.forEach((file: any) => {
      log(`\n   File Type: ${file.file_type}`);
      log(`   Filename: ${file.original_filename}`);
      log(`   Status: ${file.upload_status}`);
      log(`   Storage Path: ${file.file_path}`);
    });

    log('');

    results.push({
      step: 'Verify Files',
      success: data.files.length === 5,
      data: data.files,
      duration,
    });

    return data.files.length === 5;
  } catch (error: any) {
    log(`❌ File verification failed: ${error.message}\n`);
    results.push({
      step: 'Verify Files',
      success: false,
      error: error.message,
    });
    return false;
  }
}

async function printSummary(projectId: string | null) {
  logSection('📊 Test Summary Report');

  const totalDuration = results.reduce((sum, r) => sum + (r.duration || 0), 0);
  const successCount = results.filter((r) => r.success).length;

  log(`Project ID: ${projectId || 'N/A'}`);
  log(`Companies Tested: ${TEST_COMPANIES.length}`);
  log(`Total Steps: ${results.length}`);
  log(`Successful Steps: ${successCount}/${results.length}`);
  log(`Total Duration: ${(totalDuration / 1000).toFixed(2)}s`);

  log('\nCompanies:');
  TEST_COMPANIES.forEach((company, i) => {
    log(`  ${i + 1}. ${company}`);
  });

  log('\nTest Results:');
  results.forEach((result, i) => {
    const icon = result.success ? '✅' : '❌';
    const duration = result.duration ? ` (${result.duration}ms)` : '';
    log(`  ${i + 1}. ${icon} ${result.step}${duration}`);
    if (result.error) {
      log(`     Error: ${result.error}`);
    }
  });

  if (successCount === results.length) {
    log('\n🎉 All tests passed!');
    log('\nNext Steps:');
    log('  1. Open http://localhost:3000');
    log('  2. Navigate to the Projects module');
    log('  3. Find the test project');
    log('  4. Click "Run Analysis" to process the reports');
    log('  5. View results in Summary/Details/Diagnostics tabs');
  } else {
    log('\n⚠️  Some tests failed. Please check the errors above.');
  }

  log('');
}

async function runTests() {
  const testStartTime = Date.now();

  logSection('🧪 Company Research Agent Test');
  log(`Testing companies: ${TEST_COMPANIES.join(', ')}`);
  log(`Started at: ${new Date().toISOString()}`);
  log(`API Base URL: ${API_BASE_URL}`);

  
  const projectId = await testCreateProject();
  if (!projectId) {
    log('Cannot continue without project ID. Exiting.');
    await printSummary(null);
    process.exit(1);
  }

  
  const researchSuccess = await testResearchCompanies(projectId);
  if (!researchSuccess) {
    log('Research failed. Continuing with verification steps...');
  }

  
  await testVerifyProject(projectId);

  
  await testVerifyFiles(projectId);

  
  const totalDuration = Date.now() - testStartTime;
  await printSummary(projectId);
  log(`\nTotal Test Duration: ${(totalDuration / 1000).toFixed(2)}s\n`);
}


runTests().catch((error) => {
  console.error('\n❌ Test script crashed:', error);
  process.exit(1);
});
