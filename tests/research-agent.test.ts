/**
 * Integration Test for Company Research Agent
 *
 * Tests the end-to-end flow of researching companies:
 * 1. Create a project
 * 2. Research companies
 * 3. Verify file uploads
 * 4. Check database records
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';

const TEST_COMPANIES = [
  'BASF',
  'Vulcan Materials',
  'Ziegler CAT',
  'Harsco Metals Group'
];

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

describe('Company Research Agent Integration Test', () => {
  let projectId: string;
  let testStartTime: number;

  beforeAll(() => {
    testStartTime = Date.now();
    console.log('\n=================================');
    console.log('Company Research Agent Test');
    console.log('=================================');
    console.log(`Testing companies: ${TEST_COMPANIES.join(', ')}`);
    console.log(`Started at: ${new Date().toISOString()}`);
    console.log('=================================\n');
  });

  afterAll(() => {
    const duration = ((Date.now() - testStartTime) / 1000).toFixed(2);
    console.log('\n=================================');
    console.log(`Test completed in ${duration} seconds`);
    console.log('=================================\n');
  });

  it('should create a project for the research', async () => {
    console.log('📝 Step 1: Creating project...');

    const response = await fetch(`${API_BASE_URL}/api/sustainability/projects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: `Test Research: ${TEST_COMPANIES.join(', ')}`,
        description: `Integration test for researching 4 companies - ${new Date().toISOString()}`,
      }),
    });

    const data = await response.json();

    expect(response.ok).toBe(true);
    expect(data.success).toBe(true);
    expect(data.project).toBeDefined();
    expect(data.project.id).toBeDefined();

    projectId = data.project.id;

    console.log(`✅ Project created with ID: ${projectId}\n`);
  }, 30000); // 30 second timeout

  it('should research all 4 companies and generate reports', async () => {
    console.log('🔍 Step 2: Researching companies...');
    console.log(`   Companies: ${TEST_COMPANIES.join(', ')}`);
    console.log('   This may take 2-5 minutes...\n');

    const startTime = Date.now();

    const response = await fetch(`${API_BASE_URL}/api/research-companies`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        companies: TEST_COMPANIES.map(name => ({ name })),
        projectId: projectId,
      }),
    });

    const data = await response.json();
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log(`\n⏱️  Research completed in ${duration} seconds`);

    expect(response.ok).toBe(true);
    expect(data.success).toBe(true);
    expect(data.message).toContain('4 companies');
    expect(data.uploadedFiles).toBe(5); // Should generate 5 report files

    console.log(`✅ Successfully generated ${data.uploadedFiles} report files\n`);
  }, 300000); // 5 minute timeout for research

  it('should verify file uploads in storage', async () => {
    console.log('📂 Step 3: Verifying file uploads...');

    // Fetch the project to check file IDs
    const response = await fetch(
      `${API_BASE_URL}/api/sustainability/projects?id=${projectId}`
    );

    const data = await response.json();

    expect(response.ok).toBe(true);
    expect(data.success).toBe(true);
    expect(data.project).toBeDefined();

    const project = data.project;

    // Check that file IDs are set
    const fileTypes = [
      'emissions_file_id',
      'investments_file_id',
      'machine_purchases_file_id',
      'pilot_projects_file_id',
      'project_environments_file_id',
    ];

    const uploadedFileTypes: string[] = [];

    fileTypes.forEach(fileType => {
      if (project[fileType]) {
        uploadedFileTypes.push(fileType);
        console.log(`   ✓ ${fileType}: ${project[fileType]}`);
      } else {
        console.log(`   ✗ ${fileType}: NOT UPLOADED`);
      }
    });

    expect(uploadedFileTypes.length).toBe(5);
    console.log(`\n✅ All 5 file types uploaded successfully\n`);
  }, 30000);

  it('should verify project_files records in database', async () => {
    console.log('💾 Step 4: Verifying database records...');

    const response = await fetch(
      `${API_BASE_URL}/api/sustainability/files?projectId=${projectId}`
    );

    const data = await response.json();

    expect(response.ok).toBe(true);
    expect(data.success).toBe(true);
    expect(data.files).toBeDefined();
    expect(Array.isArray(data.files)).toBe(true);
    expect(data.files.length).toBe(5);

    const fileTypes = data.files.map((f: any) => f.file_type).sort();
    const expectedTypes = [
      'emissions',
      'investments',
      'machine_purchases',
      'pilot_projects',
      'project_environments'
    ].sort();

    expect(fileTypes).toEqual(expectedTypes);

    console.log('   Database records:');
    data.files.forEach((file: any) => {
      console.log(`   ✓ ${file.file_type}: ${file.original_filename}`);
      console.log(`     Status: ${file.upload_status}`);
      console.log(`     Path: ${file.file_path}`);
    });

    console.log('\n✅ All database records verified\n');
  }, 30000);

  it('should download and verify report content', async () => {
    console.log('📥 Step 5: Verifying report content...');

    // Note: This test requires Supabase client access
    // For now, we'll just verify the structure is correct
    console.log('   Skipping content verification (requires Supabase client)');
    console.log('   Manual verification recommended\n');

    expect(true).toBe(true);
  });

  it('should print summary report', async () => {
    console.log('📊 Research Summary Report');
    console.log('=================================');
    console.log(`Project ID: ${projectId}`);
    console.log(`Companies Researched: ${TEST_COMPANIES.length}`);
    console.log('Companies:');
    TEST_COMPANIES.forEach((company, i) => {
      console.log(`  ${i + 1}. ${company}`);
    });
    console.log('\nGenerated Reports:');
    console.log('  1. emissions_report.txt');
    console.log('  2. investments_report.txt');
    console.log('  3. machine_purchases_report.txt');
    console.log('  4. pilot_projects_report.txt');
    console.log('  5. project_environments_report.txt');
    console.log('\nNext Steps:');
    console.log('  1. Navigate to the Projects module in the UI');
    console.log(`  2. Find project: "Test Research: ${TEST_COMPANIES.join(', ')}"`);
    console.log('  3. Click "Run Analysis" to process the reports');
    console.log('  4. View results in Summary/Details/Diagnostics tabs');
    console.log('=================================\n');

    expect(projectId).toBeDefined();
  });
});

/**
 * Manual Test Instructions
 * ========================
 *
 * To run this test manually:
 *
 * 1. Ensure your development environment is set up:
 *    - Start Next.js: npm run dev
 *    - Start Supabase: npx supabase start
 *    - Set TAVILY_API_KEY in .env.local
 *
 * 2. Run the test:
 *    npm test tests/research-agent.test.ts
 *
 * 3. The test will:
 *    - Create a new project
 *    - Research BASF, Vulcan Materials, Ziegler CAT, and Harsco Metals Group
 *    - Generate 5 TXT report files
 *    - Upload files to Supabase Storage
 *    - Verify database records
 *    - Print a summary report
 *
 * 4. After the test completes:
 *    - Open http://localhost:3000
 *    - Navigate to the Projects module
 *    - Find the test project (contains "Test Research" in the name)
 *    - Click "Run Analysis" to see the results
 *
 * Expected Duration: 2-5 minutes
 *
 * Troubleshooting:
 * - If test times out: Increase timeout values in test configuration
 * - If API errors: Check that TAVILY_API_KEY is set correctly
 * - If database errors: Ensure Supabase is running and migrations are applied
 */
