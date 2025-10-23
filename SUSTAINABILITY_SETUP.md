# Sustainability Data Processor - Setup Guide

## Overview

The Sustainability Data Processor is a web application for analyzing sustainability reports across multiple companies. The app allows users to:

1. **Create Projects**: Manage multiple analysis projects
2. **Upload Files**: Upload up to 5 TXT report files (emissions, investments, machine purchases, pilot projects, project environments)
3. **Run Analysis**: Trigger backend analysis that processes the reports
4. **View Results**: Display results in three formats:
   - **Summary**: One row per company with Yes/No values for 6 attributes
   - **Details**: Detailed original results with customer, attribute, text, source, and URL columns
   - **Diagnostics**: Count statistics per company per report type

## Accessing the Application

### From Main App
1. Access the app at `http://localhost:3000/sustainability`
2. Or navigate to the Sustainability section if integrated into the main menu

### Default User
- The app uses a hardcoded user ID for development: `b2bbb440-1d79-42fa-81e3-069efd22fae8`
- In production, update the hardcoded user ID in API routes with proper authentication

## Database Setup

The migration automatically creates these tables:

- `sustainability_projects` - Project metadata
- `project_files` - Uploaded files
- `analysis_results` - Summary results (one row per company)
- `analysis_details` - Detailed results (one row per attribute per company)
- `analysis_diagnostics` - Diagnostic statistics (counts per company per report)

Run migrations with:
```bash
npx supabase db push
```

## Storage Setup

Create a storage bucket named `sustainability-reports`:

1. Visit Supabase Dashboard: http://127.0.0.1:54323 (local) or your cloud project
2. Navigate to Storage
3. Create a new bucket named `sustainability-reports`
4. Set it as private (user access controlled)

## API Endpoints

### Projects
- **GET** `/api/sustainability/projects` - List all projects
- **POST** `/api/sustainability/projects` - Create a new project
- **DELETE** `/api/sustainability/projects` - Delete a project

### File Upload
- **POST** `/api/sustainability/upload` - Upload a file

Request body:
```
FormData:
- file: File (required, .txt only)
- projectId: string (required)
- fileType: string (required, one of: emissions, investments, machine_purchases, pilot_projects, project_environments)
```

### Analysis
- **POST** `/api/sustainability/analyze` - Run analysis on a project

Request body:
```json
{
  "projectId": "project-uuid"
}
```

### Results
- **GET** `/api/sustainability/results?projectId=...&type=summary|details|diagnostics` - Fetch analysis results

## Component Structure

```
src/components/
├── SustainabilityDashboard.tsx          # Main dashboard
├── sustainability/
│   ├── ProjectManager.tsx               # Project CRUD
│   ├── FileUploadArea.tsx               # File upload interface
│   └── AnalysisResultsView.tsx          # Results display
└── ui/                                   # Reusable UI components

src/app/
├── sustainability/
│   └── page.tsx                         # Sustainability page
└── api/sustainability/
    ├── projects/route.ts                # Project endpoints
    ├── upload/route.ts                  # File upload endpoint
    ├── analyze/route.ts                 # Analysis trigger endpoint
    └── results/route.ts                 # Results fetch endpoint
```

## Responsive Design

The dashboard is fully responsive:

- **Mobile** (< 768px): Single column layout, stacked components
- **Tablet** (768px+): Two-column upload layout, proper spacing
- **Desktop** (1024px+): Full sidebar + content layout

## Styling

The application uses:
- **Tailwind CSS** for utility-based styling
- **Radix UI** components for accessible UI elements
- **Dark/light mode support** via next-themes (if configured)

Class names follow semantic conventions:
- `bg-blue-600`, `hover:bg-blue-700` - Color and interactive states
- `grid`, `flex`, `md:`, `lg:` - Responsive layouts
- `px-4`, `py-3`, `gap-4` - Spacing and alignment
- `text-sm`, `font-semibold`, `rounded-lg` - Typography and shapes

## Analysis Results Format

### Summary Results
```json
{
  "company_name": "Company A",
  "commitment_to_reduce": true,
  "net_zero_target": false,
  "pilot": true,
  "investment_announced": true,
  "equipment_purchased": false,
  "project_environment": true
}
```

### Detailed Results
```json
{
  "customer": "Company A",
  "attribute": "Commitment to Reduce",
  "yes_no": "Yes",
  "text_value": "Company A committed to reducing emissions by 50% by 2030",
  "source": "emissions",
  "url": "https://example.com/company-a",
  "source_file_type": "emissions"
}
```

### Diagnostics
```json
{
  "company_name": "Company A",
  "emissions_count": 5,
  "investments_count": 3,
  "machine_purchases_count": 2,
  "pilot_projects_count": 4,
  "project_environments_count": 1,
  "total_count": 15
}
```

## Implementation Notes

### Mock Analysis
Currently, the analysis endpoint uses mock data. To integrate with a real analysis script:

1. Replace the `runAnalysisScript()` function in `/api/sustainability/analyze/route.ts`
2. Add your actual analysis logic
3. Return results in the expected format above

### File Validation
- Only `.txt` (text/plain) files are accepted
- File size is limited by your Supabase storage configuration

### Search and Export
- Results support searching/filtering by company or attribute
- Export to CSV format is implemented
- For Excel format, process the CSV with a server-side library

## Future Enhancements

1. **Real Analysis Script Integration**: Connect to your backend analysis service
2. **Batch Processing**: Queue large analyses with Inngest
3. **File History**: Track file versions and analysis history
4. **Advanced Filtering**: Add more filter options to results
5. **Charts and Visualizations**: Add data visualization components
6. **Report Generation**: Generate PDF reports from results
7. **User Authentication**: Integrate with Supabase Auth or another provider
8. **Sharing**: Allow sharing projects with team members

## Troubleshooting

### Files not uploading
- Verify the `sustainability-reports` bucket exists
- Check file is in `.txt` format
- Ensure project ID is valid

### Analysis not running
- Check that at least one file is uploaded
- Verify database tables exist (run migration)
- Check browser console for error messages

### Results not displaying
- Ensure analysis has completed (check status in project)
- Try refreshing the page
- Check network tab in developer tools

## Development

### Running Locally

```bash
# Start dev server
npm run dev

# Start Supabase
npx supabase start

# Run migrations
npx supabase db reset
```

### Testing

Create a test project:
1. Click "New Project"
2. Upload test files
3. Click "Run Analysis"
4. View results in the Summary, Details, and Diagnostics tabs

## Production Deployment

Before deploying to production:

1. **Replace hardcoded user ID** in API routes with proper authentication
2. **Create storage bucket** in production Supabase
3. **Run migrations** on production database
4. **Configure environment variables**:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
5. **Implement real analysis script** (not mock data)
6. **Enable RLS policies** if using shared database
7. **Add proper error handling** and logging
