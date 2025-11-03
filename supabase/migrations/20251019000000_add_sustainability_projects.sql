CREATE TABLE sustainability_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  name text NOT NULL,
  description text,

  emissions_file_id uuid,
  investments_file_id uuid,
  machine_purchases_file_id uuid,
  pilot_projects_file_id uuid,
  project_environments_file_id uuid,

  analysis_status text DEFAULT 'pending',
  analysis_error text,
  analysis_results_id uuid,

  output_excel_file_id uuid,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER sustainability_projects_updated_at
  BEFORE UPDATE ON sustainability_projects
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_sustainability_projects_user_id ON sustainability_projects(user_id);
CREATE INDEX idx_sustainability_projects_created_at ON sustainability_projects(created_at DESC);

CREATE TABLE project_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES sustainability_projects(id) ON DELETE CASCADE,

  file_type text NOT NULL,
  original_filename text NOT NULL,
  storage_bucket text NOT NULL,
  file_path text NOT NULL,
  file_size_bytes integer,
  mime_type text,

  upload_status text DEFAULT 'pending',

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER project_files_updated_at
  BEFORE UPDATE ON project_files
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_project_files_project_id ON project_files(project_id);
CREATE INDEX idx_project_files_file_type ON project_files(file_type);

CREATE TABLE analysis_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES sustainability_projects(id) ON DELETE CASCADE,

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

CREATE TRIGGER analysis_results_updated_at
  BEFORE UPDATE ON analysis_results
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_analysis_results_project_id ON analysis_results(project_id);

CREATE TABLE analysis_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES sustainability_projects(id) ON DELETE CASCADE,

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

CREATE TRIGGER analysis_details_updated_at
  BEFORE UPDATE ON analysis_details
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_analysis_details_project_id ON analysis_details(project_id);
CREATE INDEX idx_analysis_details_customer ON analysis_details(customer);

CREATE TABLE analysis_diagnostics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES sustainability_projects(id) ON DELETE CASCADE,

  company_name text NOT NULL,
  emissions_count integer DEFAULT 0,
  investments_count integer DEFAULT 0,
  machine_purchases_count integer DEFAULT 0,
  pilot_projects_count integer DEFAULT 0,
  project_environments_count integer DEFAULT 0,
  total_count integer DEFAULT 0,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER analysis_diagnostics_updated_at
  BEFORE UPDATE ON analysis_diagnostics
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_analysis_diagnostics_project_id ON analysis_diagnostics(project_id);
