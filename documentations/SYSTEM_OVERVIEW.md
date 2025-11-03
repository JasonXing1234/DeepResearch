# DeepResearch System Overview & Architecture

## High-Level System Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           USER INTERFACE LAYER                              │
│                                                                             │
│  ┌────────────────────┐  ┌─────────────────────┐  ┌──────────────────┐    │
│  │ Deep Research      │  │ Project Manager     │  │ Results Explorer │    │
│  │ Engine             │  │                     │  │                  │    │
│  │ ┌──────────────┐   │  │ • Create Project    │  │ • Summary View   │    │
│  │ │ Enter 1-4    │   │  │ • Upload Files      │  │ • Details View   │    │
│  │ │ companies    │   │  │ • Track Status      │  │ • Diagnostics    │    │
│  │ │ Click Run    │   │  │ • View History      │  │ • Export Data    │    │
│  │ └──────────────┘   │  └─────────────────────┘  └──────────────────┘    │
│  └────────────────────┘                                                     │
│           ↓                      ↓                         ↓                │
└─────────────────────────────────────────────────────────────────────────────┘
           ↓                      ↓                         ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│                         API GATEWAY LAYER (Next.js)                         │
│                                                                             │
│  ┌──────────────────────────┐  ┌─────────────────────┐  ┌───────────────┐ │
│  │ /api/research-companies  │  │ /api/sustainability │  │ /api/results  │ │
│  │ • Create queue entry     │  │ • Project CRUD      │  │ • Get summary │ │
│  │ • Trigger web search     │  │ • File management   │  │ • Get details │ │
│  │ • Generate reports       │  │ • Upload handling   │  │ • Get diags   │ │
│  │ • Track progress         │  │ • Validate files    │  │ • Export      │ │
│  └──────────────────────────┘  └─────────────────────┘  └───────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
           ↓                      ↓                         ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│                      EXTERNAL SERVICES & DATABASES                          │
│                                                                             │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────┐  ┌──────────────┐      │
│  │ Tavily API  │  │ OpenAI API   │  │ Supabase   │  │ Inngest      │      │
│  │ (Web Search)│  │ (Optional NLP)   │ (Database) │  │ (Job Queue)  │      │
│  └─────────────┘  └──────────────┘  └────────────┘  └──────────────┘      │
│         ↓                ↓               ↓                 ↓                │
│  Search Results    Processed Data   Persistence      Async Jobs             │
│  (10 results)      (If enabled)     Storage          Background             │
│                                                       Processing             │
└─────────────────────────────────────────────────────────────────────────────┘
           ↓                      ↓                         ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│                            DATA STORAGE LAYER                               │
│                                                                             │
│  ┌─────────────────────────┐          ┌───────────────────────────────┐   │
│  │    PostgreSQL Database  │          │   Cloud File Storage          │   │
│  │                         │          │                               │   │
│  │ Tables:                 │          │ Bucket: sustainability-       │   │
│  │ • sustainability_       │          │ reports/                      │   │
│  │   projects              │          │ ├── {userID}/                 │   │
│  │ • project_files         │          │ │   ├── emissions_*.json      │   │
│  │ • analysis_results      │          │ │   ├── investments_*.json    │   │
│  │ • analysis_details      │          │ │   ├── purchases_*.json      │   │
│  │ • analysis_diagnostics  │          │ │   ├── pilots_*.json         │   │
│  │ • research_queue        │          │ │   └── environments_*.json   │   │
│  │ • research_documents    │          │ └──                           │   │
│  │ • research_segments     │          │                               │   │
│  └─────────────────────────┘          └───────────────────────────────┘   │
│                                                                             │
│  All data encrypted at rest, HTTPS in transit, user isolation              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow: Complete Journey

### Scenario: Research BASF

```
TIME    EVENT                           DATA FLOW
────────────────────────────────────────────────────────────────────────────

T=0:00  User enters "BASF"          [UI] → [API] → [Database]
        System creates project              ↓
                                      New project_id created

T=0:10  Web research triggered       [API] → [Tavily Search API]
        5 search queries fired            ↓
                                      Results: 50 web pages
                                           ↓
                                      Parse & extract
                                           ↓
                                      Generate JSON

T=0:30  Files generated              [Memory] → [Cloud Storage]
        5 JSON files created              ↓
        (emissions, investments,    Files uploaded:
         purchases, pilots,         sustainability-reports/
         environments)              UUID/emissions_*.json
                                    UUID/investments_*.json
                                    etc.

T=0:40  Database records updated    [JSON] → [Database]
        project_files table              ↓
        research_documents table    All 5 files indexed
        research_segments table

T=0:50  Analysis triggered          [API] → [Analysis Engine]
        Extract key attributes           ↓
                                      Pattern matching
                                      Yes/No determination
                                           ↓

T=1:00  Results stored              [Analysis] → [Database]
        analysis_results table           ↓
        analysis_details table      Summary + Details
        analysis_diagnostics table  + Diagnostics

T=1:05  Results displayed           [Database] → [UI]
        User sees results               ↓
                                    3 different views
                                    Ready for export

────────────────────────────────────────────────────────────────────────────
Total Time: 1 minute 5 seconds
```

---

## Data Structure: What Gets Stored

### Input Flow
```
User Input (Text)
      ↓
Web Search Results (JSON)
      ↓
Structured Reports (5 Files)
  ├─ Emissions.json
  ├─ Investments.json
  ├─ Purchases.json
  ├─ Pilots.json
  └─ Environments.json
      ↓
Cloud Storage + Database
```

### Processing Flow
```
Raw JSON Files
      ↓
Parsing & Extraction
      ↓
Attribute Detection
  ├─ Commitment to Reduce?
  ├─ Net-Zero Target?
  ├─ Pilot Programs?
  ├─ Investment Announced?
  ├─ Equipment Purchased?
  └─ Project Environment?
      ↓
3 Result Tables
  ├─ Summary (1 row per company)
  ├─ Details (1-6 rows per company)
  └─ Diagnostics (counts per category)
      ↓
Export (CSV, Excel, JSON)
```

---

## Input Format Example

### What Goes In (Emissions File)
```json
[
  {
    "Company": "BASF",
    "Emissions Reduction Target": "30%",
    "Target Year": "2030",
    "Baseline Year": "2018",
    "Pledge Year": "2021",
    "Net-Zero Target": false,
    "Source": [
      "https://basf.com/investor-relations/climate-2024.pdf"
    ],
    "Comments": "BASF committed to 30% GHG reduction by 2030 vs 2018 baseline"
  }
]
```

### What Comes Out (Summary Result)
```json
{
  "company_name": "BASF",
  "commitment_to_reduce": true,        ← Detected from "Emissions Reduction Target"
  "net_zero_target": false,            ← From "Net-Zero Target" field
  "pilot": true,                       ← Found in Pilots file
  "investment_announced": true,        ← Found in Investments file
  "equipment_purchased": true,         ← Found in Purchases file
  "project_environment": true          ← Found in Environments file
}
```

---

## Database Schema (Core Tables)

### 1. sustainability_projects
```sql
id (UUID)                      -- Project unique identifier
user_id (UUID)                 -- Owner
name (TEXT)                    -- Project name
description (TEXT)             -- Optional description
analysis_status (TEXT)         -- pending | processing | completed | failed
emissions_file_id (UUID)       -- Reference to emissions file
investments_file_id (UUID)     -- Reference to investments file
machine_purchases_file_id (UUID) -- Reference to purchases file
pilot_projects_file_id (UUID)  -- Reference to pilots file
project_environments_file_id (UUID) -- Reference to environments file
created_at (TIMESTAMP)
updated_at (TIMESTAMP)
```

### 2. project_files
```sql
id (UUID)                      -- File unique identifier
project_id (UUID)              -- FK to project
file_type (TEXT)               -- emissions | investments | machine_purchases | pilot_projects | project_environments
original_filename (TEXT)       -- User-friendly name
storage_bucket (TEXT)          -- Cloud storage bucket name
file_path (TEXT)               -- Path within bucket
file_size_bytes (INTEGER)      -- For UI display
mime_type (TEXT)               -- application/json or text/plain
upload_status (TEXT)           -- pending | uploading | completed | failed
created_at (TIMESTAMP)
updated_at (TIMESTAMP)
```

### 3. analysis_results (Summary View)
```sql
id (UUID)
project_id (UUID)              -- FK to project
company_name (TEXT)
commitment_to_reduce (BOOLEAN)
net_zero_target (BOOLEAN)
pilot (BOOLEAN)
investment_announced (BOOLEAN)
equipment_purchased (BOOLEAN)
project_environment (BOOLEAN)
created_at (TIMESTAMP)
updated_at (TIMESTAMP)
```

### 4. analysis_details (Evidence View)
```sql
id (UUID)
project_id (UUID)
customer (TEXT)                -- Company name
attribute (TEXT)               -- Which of the 6 attributes
yes_no (TEXT)                  -- Yes | No | Unknown
text_value (TEXT)              -- Full evidence text
source (TEXT)                  -- File type: emissions | investments...
url (TEXT)                     -- Original source URL
source_file_type (TEXT)        -- Which category file this came from
created_at (TIMESTAMP)
updated_at (TIMESTAMP)
```

### 5. analysis_diagnostics (Stats View)
```sql
id (UUID)
project_id (UUID)
company_name (TEXT)
emissions_count (INTEGER)      -- # of mentions in emissions file
investments_count (INTEGER)
machine_purchases_count (INTEGER)
pilot_projects_count (INTEGER)
project_environments_count (INTEGER)
total_count (INTEGER)          -- Sum of all counts
created_at (TIMESTAMP)
updated_at (TIMESTAMP)
```

---

## Component Architecture

### Frontend Components (React)

```
App
├── Navigation
├── SustainabilityDashboard (Main Layout)
│   ├── DeepResearchEngine
│   │   ├── CompanyInputs (4 text fields)
│   │   ├── RunButton
│   │   ├── ResearchHistory (Table of past research)
│   │   └── ProgressIndicators
│   │
│   ├── ProjectManager
│   │   ├── ProjectList
│   │   ├── CreateProjectDialog
│   │   ├── FileUploadArea
│   │   │   ├── FileTypeSelector
│   │   │   └── FileDropZone
│   │   ├── ProjectDetails
│   │   └── AnalysisButton
│   │
│   └── ResultsExplorer
│       ├── Tabs (Summary | Details | Diagnostics)
│       ├── Summary View
│       │   ├── DataTable
│       │   └── Comparison Chart
│       ├── Details View
│       │   ├── Search/Filter
│       │   ├── EvidenceTable
│       │   └── SourceLinks
│       └── Diagnostics View
│           ├── CountStats
│           └── ExportButton

```

### API Endpoints

```
GET  /api/sustainability/projects          -- List projects
POST /api/sustainability/projects          -- Create project
DELETE /api/sustainability/projects        -- Delete project

POST /api/sustainability/upload            -- Upload file to project
POST /api/research-companies               -- Trigger web research

POST /api/sustainability/analyze           -- Run analysis
GET  /api/sustainability/results           -- Get results (type=summary|details|diagnostics)

GET  /api/research-queue                   -- Get research history
GET  /api/research-queue/[id]              -- Get specific research

POST /api/sustainability/export-excel      -- Export to Excel
```

---

## Deployment Architecture

### Local Development
```
Your Computer
├── Node.js (npm run dev)
├── Next.js Dev Server (port 3000)
├── Supabase Local (Docker)
│   ├── PostgreSQL (port 5432)
│   ├── Storage (port 5000)
│   └── Auth (local)
└── Browser (http://localhost:3000)
```

### Production Deployment
```
Cloud Infrastructure
├── Frontend
│   └── Vercel (or any Node.js host)
│       └── Next.js App (http://yourdomain.com)
│
├── Backend
│   └── Vercel Functions (or AWS Lambda)
│       └── API Routes (/api/...)
│
├── Database
│   └── Supabase Cloud
│       ├── PostgreSQL (managed)
│       └── Storage (S3-compatible)
│
└── External Services
    ├── Tavily API (web search)
    ├── OpenAI API (optional NLP)
    └── Inngest Cloud (job queue)
```

---

## Performance Characteristics

### Response Times (Approximate)

| Operation | Time | Bottleneck |
|-----------|------|------------|
| Create project | <1s | Database insert |
| Web search (1 company) | 15-30s | Tavily API |
| Generate report | <5s | JSON processing |
| Upload files | 1-5s | Network + Storage |
| Run analysis | 1-3s | Pattern matching |
| Export to Excel | 2-10s | File generation |
| List results | <1s | Database query |

### Scalability

```
Concurrent Users:           100+
Companies per batch:        1-100
Batch processing time:      Scales linearly with count
Database connections:       Managed by Supabase
Storage:                    Unlimited (S3-compatible)
Monthly cost per 100 researches: ~$100
```

---

## Security Model

### Data Isolation
```
User A's Data:
├── Projects (visible only to User A)
├── Files (stored in User A's folder)
└── Results (queried with User A's ID)

User B's Data:
├── Projects (completely separate)
├── Files (completely separate)
└── Results (completely separate)
```

### Encryption
```
At Rest:        AES-256 (Supabase default)
In Transit:     TLS 1.3 (HTTPS)
API Keys:       Environment variables (never in code)
Audit Log:      All operations timestamped
```

---

## Error Handling

### Graceful Degradation
```
Tavily API Down?
└─ Returns: "No data found"
   User can manually upload files

OpenAI API Down?
└─ Returns: "NLP features disabled"
   Analysis still works

Database Connection Error?
└─ Returns: "Service temporarily unavailable"
   Retries automatically

File Upload Failed?
└─ Returns: "Upload failed"
   User can retry immediately
```

---

## Monitoring & Health Checks

### Key Metrics to Track
```
API Response Time:          Should be <1s for most endpoints
Database Query Time:        Should be <500ms
Web Search Success Rate:    Should be >95%
File Upload Success Rate:   Should be >98%
System Uptime:              Should be >99.5%
Storage Usage:              Monitor for cost optimization
API Quota Usage:            Prevent rate limit issues
```

---

## Future Architecture (Phase 2+)

### Planned Enhancements
```
Current (Phase 1):
├── UI Layer (React)
├── API Layer (Next.js)
└── External Services

Planned (Phase 2):
├── Add: Admin Dashboard
├── Add: User Management
├── Add: Advanced Analytics
├── Add: Scheduling Engine
└── Add: Notification Service

Planned (Phase 3):
├── Add: ML Pipeline (Trend detection)
├── Add: Real-time Updates (WebSocket)
├── Add: API Rate Limiting
└── Add: Multi-tenant Support
```

---

## Disaster Recovery

### Backup Strategy
```
Database:           Automated daily backups (Supabase)
Storage:            Multi-region replication
Code:               GitHub version control
Configuration:      Environment variables backup
Recovery Time:      <1 hour for full restore
```

---

## Cost Optimization

### Reducing Costs
```
Option 1: Batch Processing
├─ Group 100 companies
├─ Run in off-peak hours
└─ Save 30% on compute

Option 2: Caching
├─ Cache search results for repeat companies
├─ Cache analysis results
└─ Save 50% on API calls

Option 3: Selective Research
├─ Research only changes (delta)
├─ Skip unchanged companies
└─ Save 70% on searches
```

---

**Document Version:** 1.0  
**Technical Audience:** Developers, DevOps, System Architects  
**For Questions:** See README.md or contact tech team

