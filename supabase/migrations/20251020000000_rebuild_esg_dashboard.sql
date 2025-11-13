CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,

  name text NOT NULL,
  description text,

  analysis_status text DEFAULT 'pending',
  analysis_error text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS projects_updated_at ON projects;
CREATE TRIGGER projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

DROP INDEX IF EXISTS idx_projects_user_id;
CREATE INDEX idx_projects_user_id ON projects(user_id);
DROP INDEX IF EXISTS idx_projects_created_at;
CREATE INDEX idx_projects_created_at ON projects(created_at DESC);

CREATE TABLE IF NOT EXISTS project_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  file_type text NOT NULL CHECK (file_type IN ('emissions', 'investments', 'purchases', 'pilots', 'environments', 'output')),

  original_filename text NOT NULL,
  file_size_bytes integer,
  mime_type text,

  storage_bucket text NOT NULL DEFAULT 'esg-files',
  file_path text NOT NULL,
  download_url text,

  upload_status text DEFAULT 'pending',
  upload_error text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS project_files_updated_at ON project_files;
CREATE TRIGGER project_files_updated_at
  BEFORE UPDATE ON project_files
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

DROP INDEX IF EXISTS idx_project_files_project_id;
CREATE INDEX idx_project_files_project_id ON project_files(project_id);
DROP INDEX IF EXISTS idx_project_files_file_type;
CREATE INDEX idx_project_files_file_type ON project_files(file_type);

CREATE TABLE IF NOT EXISTS deep_research_queries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,

  company_names text[] NOT NULL,

  emissions_data jsonb,
  investments_data jsonb,
  purchases_data jsonb,
  pilots_data jsonb,
  environments_data jsonb,

  research_status text DEFAULT 'pending',
  research_error text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS deep_research_queries_updated_at ON deep_research_queries;
CREATE TRIGGER deep_research_queries_updated_at
  BEFORE UPDATE ON deep_research_queries
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

DROP INDEX IF EXISTS idx_deep_research_queries_user_id;
CREATE INDEX idx_deep_research_queries_user_id ON deep_research_queries(user_id);
DROP INDEX IF EXISTS idx_deep_research_queries_created_at;
CREATE INDEX idx_deep_research_queries_created_at ON deep_research_queries(created_at DESC);

CREATE TABLE IF NOT EXISTS analysis_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  company_name text NOT NULL,
  commitment_to_reduce boolean DEFAULT false,
  net_zero_target boolean DEFAULT false,
  pilot boolean DEFAULT false,
  investment_announced boolean DEFAULT false,
  equipment_purchased boolean DEFAULT false,
  project_environment boolean DEFAULT false,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS analysis_summaries_updated_at ON analysis_summaries;
CREATE TRIGGER analysis_summaries_updated_at
  BEFORE UPDATE ON analysis_summaries
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

DROP INDEX IF EXISTS idx_analysis_summaries_project_id;
CREATE INDEX idx_analysis_summaries_project_id ON analysis_summaries(project_id);
DROP INDEX IF EXISTS idx_analysis_summaries_company;
CREATE INDEX idx_analysis_summaries_company ON analysis_summaries(company_name);

CREATE TABLE IF NOT EXISTS analysis_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  customer text NOT NULL,
  attribute text NOT NULL,
  yes_no text,
  text_value text,
  source text,
  url text,

  source_file_type text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS analysis_details_updated_at ON analysis_details;
CREATE TRIGGER analysis_details_updated_at
  BEFORE UPDATE ON analysis_details
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

DROP INDEX IF EXISTS idx_analysis_details_project_id;
CREATE INDEX idx_analysis_details_project_id ON analysis_details(project_id);
DROP INDEX IF EXISTS idx_analysis_details_customer;
CREATE INDEX idx_analysis_details_customer ON analysis_details(customer);

CREATE TABLE IF NOT EXISTS analysis_diagnostics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  company_name text NOT NULL,
  emissions_count integer DEFAULT 0,
  investments_count integer DEFAULT 0,
  purchases_count integer DEFAULT 0,
  pilots_count integer DEFAULT 0,
  environments_count integer DEFAULT 0,
  total_count integer DEFAULT 0,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS analysis_diagnostics_updated_at ON analysis_diagnostics;
CREATE TRIGGER analysis_diagnostics_updated_at
  BEFORE UPDATE ON analysis_diagnostics
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

DROP INDEX IF EXISTS idx_analysis_diagnostics_project_id;
CREATE INDEX idx_analysis_diagnostics_project_id ON analysis_diagnostics(project_id);
