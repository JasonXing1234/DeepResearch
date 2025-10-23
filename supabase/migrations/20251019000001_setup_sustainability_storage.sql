-- Create sustainability reports storage bucket
-- Note: In development, this bucket should be created via Supabase Dashboard
-- In production, ensure the bucket exists and policies are configured

-- Insert bucket definition (if using Supabase migrations for storage)
-- This is handled via Dashboard: Storage > Create Bucket > "sustainability-reports" (private)

-- RLS Policy for sustainability reports bucket
-- Allow authenticated users to upload files to their own project directories
-- Pattern: sustainability/{user_id}/{project_id}/{filename}

-- Note: Storage policies are typically configured via Supabase Dashboard UI
-- Below are the recommended policies (if using code-based configuration):

/*
-- Allow users to view their own files
CREATE POLICY "Users can view own sustainability files"
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'sustainability-reports' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- Allow users to upload to their own directories
CREATE POLICY "Users can upload to own sustainability directory"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'sustainability-reports' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- Allow users to delete their own files
CREATE POLICY "Users can delete own sustainability files"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'sustainability-reports' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );
*/

-- Manual setup instructions:
-- 1. Visit Supabase Dashboard
-- 2. Go to Storage section
-- 3. Create a new bucket named "sustainability-reports"
-- 4. Set visibility to Private
-- 5. Optionally configure policies as above
