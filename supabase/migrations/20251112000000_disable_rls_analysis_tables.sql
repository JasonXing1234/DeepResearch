-- Disable RLS for analysis tables to allow API access
ALTER TABLE analysis_results DISABLE ROW LEVEL SECURITY;
ALTER TABLE analysis_details DISABLE ROW LEVEL SECURITY;
ALTER TABLE analysis_diagnostics DISABLE ROW LEVEL SECURITY;
