-- ============================================================================
-- ESG Research Dashboard - Complete Schema Rebuild
-- ============================================================================
-- Schema for three main modules:
-- 1. Project Management (projects with 6-file bundles)
-- 2. Deep Research Engine (web research automation)
-- 3. Results Explorer (analysis outputs)

-- ============================================================================
-- PROJECT MANAGEMENT TABLES
-- ============================================================================

-- Projects: bundle of 5 uploaded reports + 1 Excel output
CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  -- Project metadata
  name text NOT NULL,
  description text,
  
  -- Status tracking
  analysis_status text DEFAULT 'pending', -- pending, processing, completed, failed
  analysis_error text,
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_projects_user_id ON projects(user_id);
CREATE INDEX idx_projects_created_at ON projects(created_at DESC);

-- Project Files: 5 uploaded reports + 1 Excel output (6 total)
CREATE TABLE IF NOT EXISTS project_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  
  -- File type: emissions, investments, purchases, pilots, environments (uploaded) or output (generated)
  file_type text NOT NULL CHECK (file_type IN ('emissions', 'investments', 'purchases', 'pilots', 'environments', 'output')),
  
  -- File metadata
  original_filename text NOT NULL,
  file_size_bytes integer,
  mime_type text,
  
  -- Storage info
  storage_bucket text NOT NULL DEFAULT 'esg-files',
  file_path text NOT NULL,
  download_url text,
  
  -- Upload tracking
  upload_status text DEFAULT 'pending', -- pending, uploading, completed, failed
  upload_error text,
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER project_files_updated_at
  BEFORE UPDATE ON project_files
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_project_files_project_id ON project_files(project_id);
CREATE INDEX idx_project_files_file_type ON project_files(file_type);

-- ============================================================================
-- DEEP RESEARCH ENGINE TABLES
-- ============================================================================

-- Deep Research Queries: store user inputs and results
CREATE TABLE IF NOT EXISTS deep_research_queries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  -- Research parameters
  company_names text[] NOT NULL, -- array of 1-4 company names
  
  -- Generated data references (JSON datasets)
  emissions_data jsonb,
  investments_data jsonb,
  purchases_data jsonb,
  pilots_data jsonb,
  environments_data jsonb,
  
  -- Status tracking
  research_status text DEFAULT 'pending', -- pending, researching, completed, failed
  research_error text,
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER deep_research_queries_updated_at
  BEFORE UPDATE ON deep_research_queries
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_deep_research_queries_user_id ON deep_research_queries(user_id);
CREATE INDEX idx_deep_research_queries_created_at ON deep_research_queries(created_at DESC);

-- ============================================================================
-- RESULTS EXPLORER TABLES
-- ============================================================================

-- Analysis Summary Results (Normalized View - one row per company)
CREATE TABLE IF NOT EXISTS analysis_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  
  -- Company and attributes
  company_name text NOT NULL,
  commitment_to_reduce boolean DEFAULT false,
  net_zero_target boolean DEFAULT false,
  pilot boolean DEFAULT false,
  investment_announced boolean DEFAULT false,
  equipment_purchased boolean DEFAULT false,
  project_environment boolean DEFAULT false,
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER analysis_summaries_updated_at
  BEFORE UPDATE ON analysis_summaries
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_analysis_summaries_project_id ON analysis_summaries(project_id);
CREATE INDEX idx_analysis_summaries_company ON analysis_summaries(company_name);

-- Analysis Details (Original View - detailed records)
CREATE TABLE IF NOT EXISTS analysis_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  
  -- Detailed record
  customer text NOT NULL,
  attribute text NOT NULL,
  yes_no text, -- Yes, No, or null
  text_value text,
  source text,
  url text,
  
  -- Which report this came from
  source_file_type text, -- emissions, investments, purchases, pilots, environments
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER analysis_details_updated_at
  BEFORE UPDATE ON analysis_details
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_analysis_details_project_id ON analysis_details(project_id);
CREATE INDEX idx_analysis_details_customer ON analysis_details(customer);

-- Analysis Diagnostics (counts per company per report)
CREATE TABLE IF NOT EXISTS analysis_diagnostics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  
  -- Company and counts
  company_name text NOT NULL,
  emissions_count integer DEFAULT 0,
  investments_count integer DEFAULT 0,
  purchases_count integer DEFAULT 0,
  pilots_count integer DEFAULT 0,
  environments_count integer DEFAULT 0,
  total_count integer DEFAULT 0,
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER analysis_diagnostics_updated_at
  BEFORE UPDATE ON analysis_diagnostics
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_analysis_diagnostics_project_id ON analysis_diagnostics(project_id);
