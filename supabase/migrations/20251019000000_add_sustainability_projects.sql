-- ============================================================================
-- Sustainability Data Processor - Project Schema
-- ============================================================================
-- This migration creates tables for managing sustainability projects with
-- file uploads and analysis results.

-- ============================================================================
-- TABLES
-- ============================================================================

-- Sustainability Projects
CREATE TABLE sustainability_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  -- Project metadata
  name text NOT NULL,
  description text,
  
  -- Files (5 report types)
  emissions_file_id uuid,
  investments_file_id uuid,
  machine_purchases_file_id uuid,
  pilot_projects_file_id uuid,
  project_environments_file_id uuid,
  
  -- Analysis state
  analysis_status text DEFAULT 'pending', -- pending, processing, completed, failed
  analysis_error text,
  analysis_results_id uuid, -- foreign key to analysis_results
  
  -- Output file
  output_excel_file_id uuid,
  
  -- Metadata
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER sustainability_projects_updated_at
  BEFORE UPDATE ON sustainability_projects
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_sustainability_projects_user_id ON sustainability_projects(user_id);
CREATE INDEX idx_sustainability_projects_created_at ON sustainability_projects(created_at DESC);

-- Project Files
CREATE TABLE project_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES sustainability_projects(id) ON DELETE CASCADE,
  
  -- File metadata
  file_type text NOT NULL, -- emissions, investments, machine_purchases, pilot_projects, project_environments
  original_filename text NOT NULL,
  storage_bucket text NOT NULL,
  file_path text NOT NULL,
  file_size_bytes integer,
  mime_type text,
  
  -- Upload state
  upload_status text DEFAULT 'pending', -- pending, uploading, completed, failed
  
  -- Metadata
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER project_files_updated_at
  BEFORE UPDATE ON project_files
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_project_files_project_id ON project_files(project_id);
CREATE INDEX idx_project_files_file_type ON project_files(file_type);

-- Analysis Results (Summary View - one row per company)
CREATE TABLE analysis_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES sustainability_projects(id) ON DELETE CASCADE,
  
  -- Summary columns
  company_name text NOT NULL,
  commitment_to_reduce boolean DEFAULT false,
  net_zero_target boolean DEFAULT false,
  pilot boolean DEFAULT false,
  investment_announced boolean DEFAULT false,
  equipment_purchased boolean DEFAULT false,
  project_environment boolean DEFAULT false,
  
  -- Metadata
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER analysis_results_updated_at
  BEFORE UPDATE ON analysis_results
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_analysis_results_project_id ON analysis_results(project_id);

-- Detailed Analysis Results (Original Results - one row per attribute per company)
CREATE TABLE analysis_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES sustainability_projects(id) ON DELETE CASCADE,
  
  -- Original results columns
  customer text NOT NULL,
  attribute text NOT NULL,
  yes_no text, -- Yes, No, or null
  text_value text,
  source text,
  url text,
  
  -- Which file this came from
  source_file_type text, -- emissions, investments, etc.
  
  -- Metadata
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER analysis_details_updated_at
  BEFORE UPDATE ON analysis_details
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_analysis_details_project_id ON analysis_details(project_id);
CREATE INDEX idx_analysis_details_customer ON analysis_details(customer);

-- Diagnostics (counts per company per report)
CREATE TABLE analysis_diagnostics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES sustainability_projects(id) ON DELETE CASCADE,
  
  -- Diagnostics columns
  company_name text NOT NULL,
  emissions_count integer DEFAULT 0,
  investments_count integer DEFAULT 0,
  machine_purchases_count integer DEFAULT 0,
  pilot_projects_count integer DEFAULT 0,
  project_environments_count integer DEFAULT 0,
  total_count integer DEFAULT 0,
  
  -- Metadata
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER analysis_diagnostics_updated_at
  BEFORE UPDATE ON analysis_diagnostics
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_analysis_diagnostics_project_id ON analysis_diagnostics(project_id);
