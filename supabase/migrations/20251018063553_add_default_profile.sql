-- Insert default profile for development
-- This profile will be used when no authentication is set up
INSERT INTO profiles (id, email, full_name, email_verified)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  'demo@lecturenote.local',
  'Demo User',
  true
)
ON CONFLICT (id) DO NOTHING;
