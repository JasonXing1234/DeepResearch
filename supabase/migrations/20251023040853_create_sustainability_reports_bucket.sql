INSERT INTO storage.buckets (id, name)
VALUES ('sustainability-reports', 'sustainability-reports')
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Allow authenticated uploads"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'sustainability-reports');

CREATE POLICY "Allow authenticated reads"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'sustainability-reports');

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
