-- Drop policies that depend on the foldername function
DROP POLICY IF EXISTS "Users can upload their own sustainability reports" ON storage.objects;
DROP POLICY IF EXISTS "Users can read their own sustainability reports" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own sustainability reports" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own sustainability reports" ON storage.objects;

-- Recreate simpler policies without foldername dependency
CREATE POLICY "Allow authenticated uploads to sustainability-reports"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'sustainability-reports');

CREATE POLICY "Allow authenticated reads from sustainability-reports"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'sustainability-reports');

CREATE POLICY "Allow authenticated updates to sustainability-reports"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'sustainability-reports');

CREATE POLICY "Allow authenticated deletes from sustainability-reports"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'sustainability-reports');

-- Also allow anon for dev
CREATE POLICY "Allow anon uploads to sustainability-reports for dev"
ON storage.objects FOR INSERT
TO anon
WITH CHECK (bucket_id = 'sustainability-reports');

CREATE POLICY "Allow anon reads from sustainability-reports for dev"
ON storage.objects FOR SELECT
TO anon
USING (bucket_id = 'sustainability-reports');
