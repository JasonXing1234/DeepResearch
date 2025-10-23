-- Create sustainability-reports storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('sustainability-reports', 'sustainability-reports', false, 52428800, ARRAY['text/plain']::text[])
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload files
CREATE POLICY "Allow authenticated uploads"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'sustainability-reports');

-- Allow authenticated users to read their own files
CREATE POLICY "Allow authenticated reads"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'sustainability-reports');

-- For local dev, also allow anon key
CREATE POLICY "Allow anon uploads for dev"
ON storage.objects
FOR INSERT
TO anon
WITH CHECK (bucket_id = 'sustainability-reports');

CREATE POLICY "Allow anon reads for dev"
ON storage.objects
FOR SELECT
TO anon
USING (bucket_id = 'sustainability-reports');
