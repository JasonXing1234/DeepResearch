-- Disable RLS for development on research tables
-- IMPORTANT: Re-enable these in production!

ALTER TABLE research_queue DISABLE ROW LEVEL SECURITY;
ALTER TABLE research_documents DISABLE ROW LEVEL SECURITY;
ALTER TABLE research_segments DISABLE ROW LEVEL SECURITY;

-- Create dummy class and document for research segments
-- These are required by foreign key constraints but not used
INSERT INTO classes (id, user_id, name, class_code, created_at, updated_at)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'b2bbb440-1d79-42fa-81e3-069efd22fae8',
  '[Research Placeholder]',
  'RESEARCH',
  NOW(),
  NOW()
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO documents (id, user_id, class_id, title, file_path, created_at, updated_at)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'b2bbb440-1d79-42fa-81e3-069efd22fae8',
  '00000000-0000-0000-0000-000000000001',
  '[Research Placeholder]',
  'research/placeholder',
  NOW(),
  NOW()
)
ON CONFLICT (id) DO NOTHING;
