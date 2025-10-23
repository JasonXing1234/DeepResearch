-- Create development user profile for local development
-- This user is hardcoded in the API routes during development
INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES (
  'b2bbb440-1d79-42fa-81e3-069efd22fae8',
  'dev@test.com',
  'Development User',
  NOW(),
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  full_name = EXCLUDED.full_name,
  updated_at = NOW();
