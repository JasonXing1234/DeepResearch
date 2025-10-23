# Test Instructions: Company Research Agent

This document provides instructions for testing the Company Research Agent with 4 specific companies:
- **BASF**
- **Vulcan Materials**
- **Ziegler CAT**
- **Harsco Metals Group**

## Prerequisites

Before running the test, ensure you have:

1. **Development Environment Setup**
   - Node.js installed
   - Dependencies installed: `npm install`
   - Docker running (for Supabase)

2. **Services Running**
   - Next.js dev server: `npm run dev`
   - Supabase local instance: `npx supabase start`

3. **Environment Variables Configured**
   - Create `.env.local` file with:
     ```bash
     NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
     NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-local-anon-key
     OPENAI_API_KEY=sk-your-openai-key
     TAVILY_API_KEY=tvly-your-tavily-key
     ```

4. **Database Migrations Applied**
   - Run: `npx supabase db reset` (if needed)
   - Verify tables exist: `sustainability_projects`, `project_files`

5. **Storage Buckets Created**
   - Open Supabase Studio: http://127.0.0.1:54323
   - Go to Storage
   - Create bucket: `sustainability-reports` (if doesn't exist)

## Option 1: Automated Test Script (Recommended)

### Run the test script:

```bash
# Make script executable (first time only)
chmod +x scripts/run-test.sh

# Run the test
./scripts/run-test.sh
```

The script will:
1. ✅ Check if Next.js dev server is running
2. ✅ Check if Supabase is running
3. ✅ Verify TAVILY_API_KEY is configured
4. 🧪 Run the test suite

### Expected Output:

```
============================================================
🧪 Company Research Agent Test
============================================================

Testing companies: BASF, Vulcan Materials, Ziegler CAT, Harsco Metals Group
Started at: 2025-01-22T10:30:00.000Z
API Base URL: http://localhost:3000

============================================================
📝 Step 1: Creating project...
✅ Project created successfully (1234ms)
   Project ID: abc123-def456-ghi789
   Project Name: Test Research: BASF, Vulcan Materials, Ziegler CAT, Harsco Metals Group

============================================================
🔍 Step 2: Researching companies...
   Companies: BASF, Vulcan Materials, Ziegler CAT, Harsco Metals Group
   This may take 2-5 minutes...

✅ Research completed successfully (180.52s)
   Files Generated: 5
   Message: Successfully researched 4 companies

============================================================
📂 Step 3: Verifying project updates...
✅ Project verified (123ms)
   ✓ emissions_file_id: uuid-1
   ✓ investments_file_id: uuid-2
   ✓ machine_purchases_file_id: uuid-3
   ✓ pilot_projects_file_id: uuid-4
   ✓ project_environments_file_id: uuid-5

   Total Files Uploaded: 5/5

============================================================
💾 Step 4: Verifying database records...
✅ Database records verified (89ms)
   Total Records: 5

   [File details...]

============================================================
📊 Test Summary Report
============================================================

Project ID: abc123-def456-ghi789
Companies Tested: 4
Total Steps: 4
Successful Steps: 4/4
Total Duration: 185.23s

Companies:
  1. BASF
  2. Vulcan Materials
  3. Ziegler CAT
  4. Harsco Metals Group

Test Results:
  1. ✅ Create Project (1234ms)
  2. ✅ Research Companies (180520ms)
  3. ✅ Verify Project (123ms)
  4. ✅ Verify Files (89ms)

🎉 All tests passed!

Next Steps:
  1. Open http://localhost:3000
  2. Navigate to the Projects module
  3. Find the test project
  4. Click "Run Analysis" to process the reports
  5. View results in Summary/Details/Diagnostics tabs

Total Test Duration: 185.23s
```

## Option 2: Manual Testing via UI

### Step 1: Start the application

```bash
npm run dev
```

Open http://localhost:3000

### Step 2: Navigate to Deep Research Engine

Click on "Deep Research Engine" card on the homepage

### Step 3: Enter companies

In the input fields, enter:
- Company 1: `BASF`
- Company 2: `Vulcan Materials`
- Company 3: `Ziegler CAT`
- Company 4: `Harsco Metals Group`

### Step 4: Run research

Click "Run Deep Research" button

Wait for 2-5 minutes while the research completes

### Step 5: Verify results

1. You should see a success toast: "Research completed! Generated 5 report files."
2. Navigate to "Projects" module
3. Find the project named "Research: BASF, Vulcan Materials, Ziegler CAT, Harsco Metals Group"
4. Click on the project to view details

### Step 6: Analyze the data

1. In the project view, click "Run Analysis"
2. Wait for analysis to complete
3. View results in 3 tabs:
   - **Summary**: Boolean flags per company
   - **Details**: Full text with sources
   - **Diagnostics**: Count of mentions per category

## Option 3: API Testing with cURL

### Step 1: Create a project

```bash
curl -X POST http://localhost:3000/api/sustainability/projects \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test: 4 Companies",
    "description": "Manual API test"
  }'
```

Save the returned `project.id`

### Step 2: Research companies

```bash
# Replace PROJECT_ID with the ID from step 1
curl -X POST http://localhost:3000/api/research-companies \
  -H "Content-Type: application/json" \
  -d '{
    "companies": [
      {"name": "BASF"},
      {"name": "Vulcan Materials"},
      {"name": "Ziegler CAT"},
      {"name": "Harsco Metals Group"}
    ],
    "projectId": "PROJECT_ID"
  }'
```

Wait 2-5 minutes for completion

### Step 3: Verify files

```bash
# Replace PROJECT_ID
curl http://localhost:3000/api/sustainability/projects?id=PROJECT_ID
```

Check that all 5 file_id fields are populated:
- `emissions_file_id`
- `investments_file_id`
- `machine_purchases_file_id`
- `pilot_projects_file_id`
- `project_environments_file_id`

### Step 4: Get file records

```bash
# Replace PROJECT_ID
curl http://localhost:3000/api/sustainability/files?projectId=PROJECT_ID
```

Should return 5 file records

## Expected Results

### Files Generated

5 TXT files should be created in Supabase Storage (`sustainability-reports` bucket):

1. **emissions_*.txt** - Carbon reduction commitments, net-zero targets
2. **investments_*.txt** - Sustainability investments, climate funds
3. **machine_purchases_*.txt** - Equipment purchases, infrastructure
4. **pilot_projects_*.txt** - Pilot programs, carbon capture initiatives
5. **project_environments_*.txt** - Green facilities, sustainability projects

### File Format

Each file follows this structure:

```
Company: BASF
==================================================

Title: BASF announces carbon neutrality goal
Source: https://basf.com/sustainability
Content: BASF has committed to achieving carbon neutrality by 2050...

--------------------------------------------------

Title: BASF invests in renewable energy
Source: https://news.basf.com/investments
Content: The company announced $5 billion in clean energy investments...

--------------------------------------------------

[More results for BASF...]


Company: Vulcan Materials
==================================================

[Results for Vulcan Materials...]

[And so on for all 4 companies...]
```

### Database Records

**sustainability_projects table:**
- 1 new row with project details
- All 5 file_id columns populated with UUIDs
- `analysis_status` = 'pending'

**project_files table:**
- 5 new rows (one per file type)
- Each with `upload_status` = 'completed'
- `storage_bucket` = 'sustainability-reports'
- `file_path` containing the storage path

## Troubleshooting

### Error: "Dev server is not running"
```bash
npm run dev
```

### Error: "Supabase is not running"
```bash
npx supabase start
```

### Error: "TAVILY_API_KEY not configured"
1. Sign up at https://tavily.com (free tier available)
2. Get your API key
3. Add to `.env.local`:
   ```
   TAVILY_API_KEY=tvly-your-api-key-here
   ```

### Error: "Failed to create project"
- Check Supabase is running: `npx supabase status`
- Verify migrations: `npx supabase db reset`
- Check database tables exist in Supabase Studio

### Error: "Research failed" or "Upload failed"
- Verify TAVILY_API_KEY is valid
- Check Supabase storage bucket exists
- Review API logs in terminal

### Slow performance
- Research takes ~30-45 seconds per company
- Total time for 4 companies: 2-5 minutes
- This is normal for web search APIs

### Empty or incomplete results
- Some companies may have limited online data
- Try different company names
- Check Tavily API quota/rate limits

## Verification Checklist

After running the test, verify:

- [ ] Project created successfully
- [ ] All 4 companies researched
- [ ] 5 TXT files generated
- [ ] Files uploaded to Supabase Storage
- [ ] 5 project_files records in database
- [ ] sustainability_projects row updated with file IDs
- [ ] No errors in console logs
- [ ] Can view project in Projects module
- [ ] Can run analysis on the project
- [ ] Results appear in Summary/Details/Diagnostics views

## Next Steps

After the test completes successfully:

1. **View the data**: Open the project in the UI to see the generated reports
2. **Run analysis**: Click "Run Analysis" to process the reports
3. **Export results**: Download the analysis results
4. **Try more companies**: Test with different company names
5. **Production deployment**: Set up Tavily API key in production environment

## Support

If you encounter issues:

1. Check the console logs in terminal
2. Review the API response messages
3. Verify all prerequisites are met
4. Check the RESEARCH_AGENT.md documentation
5. Review the API endpoint code in `src/app/api/research-companies/route.ts`
