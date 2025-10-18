-- Add default profile for testing (if it doesn't exist)
-- This allows the app to work without authentication during development

INSERT INTO profiles (
  id,
  supabase_auth_id,
  email,
  email_verified,
  full_name,
  university,
  major,
  graduation_year
)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  NULL,
  'test@example.com',
  true,
  'Test User',
  'Test University',
  'Computer Science',
  2025
)
ON CONFLICT (id) DO NOTHING;
