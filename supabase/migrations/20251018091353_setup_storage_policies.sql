-- ============================================================================
-- Storage Buckets and Policies
-- ============================================================================
-- This migration creates storage buckets and sets up RLS policies.
-- For development, RLS is disabled to match the table RLS configuration.

-- Create storage buckets if they don't exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('lecture-recordings', 'lecture-recordings', false, 524288000, ARRAY['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/m4a', 'audio/mp4', 'audio/webm', 'audio/ogg']),
  ('class-materials', 'class-materials', false, 52428800, ARRAY['application/pdf']),
  ('transcripts', 'transcripts', false, 10485760, ARRAY['text/plain'])
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- DEVELOPMENT: Disable RLS on storage buckets
-- ============================================================================
-- This allows uploads without authentication during development.
-- IMPORTANT: Re-enable RLS before production deployment!

-- Create permissive policies that allow all operations (for development)
CREATE POLICY "Allow all operations on lecture-recordings (DEV ONLY)"
ON storage.objects FOR ALL
USING (bucket_id = 'lecture-recordings')
WITH CHECK (bucket_id = 'lecture-recordings');

CREATE POLICY "Allow all operations on class-materials (DEV ONLY)"
ON storage.objects FOR ALL
USING (bucket_id = 'class-materials')
WITH CHECK (bucket_id = 'class-materials');

CREATE POLICY "Allow all operations on transcripts (DEV ONLY)"
ON storage.objects FOR ALL
USING (bucket_id = 'transcripts')
WITH CHECK (bucket_id = 'transcripts');

-- ============================================================================
-- PRODUCTION POLICIES (commented out for development)
-- ============================================================================
-- Uncomment these and remove the permissive policies above before production.

-- -- Users can only access their own files in lecture-recordings
-- CREATE POLICY "Users can manage own lecture recordings"
-- ON storage.objects FOR ALL
-- TO authenticated
-- USING (
--   bucket_id = 'lecture-recordings' AND
--   (storage.foldername(name))[1] = auth.uid()::text
-- )
-- WITH CHECK (
--   bucket_id = 'lecture-recordings' AND
--   (storage.foldername(name))[1] = auth.uid()::text
-- );

-- -- Users can only access their own files in class-materials
-- CREATE POLICY "Users can manage own class materials"
-- ON storage.objects FOR ALL
-- TO authenticated
-- USING (
--   bucket_id = 'class-materials' AND
--   (storage.foldername(name))[1] = auth.uid()::text
-- )
-- WITH CHECK (
--   bucket_id = 'class-materials' AND
--   (storage.foldername(name))[1] = auth.uid()::text
-- );

-- -- Users can only access their own transcripts
-- CREATE POLICY "Users can read own transcripts"
-- ON storage.objects FOR SELECT
-- TO authenticated
-- USING (
--   bucket_id = 'transcripts' AND
--   (storage.foldername(name))[1] = auth.uid()::text
-- );

-- -- System can write transcripts (for Inngest functions)
-- CREATE POLICY "System can write transcripts"
-- ON storage.objects FOR INSERT
-- TO authenticated
-- WITH CHECK (bucket_id = 'transcripts');