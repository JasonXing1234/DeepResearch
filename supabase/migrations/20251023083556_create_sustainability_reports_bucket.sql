INSERT INTO storage.buckets (id, name)
VALUES (
  'sustainability-reports',
  'sustainability-reports'
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users can upload their own sustainability reports"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'sustainability-reports' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can read their own sustainability reports"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'sustainability-reports' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can update their own sustainability reports"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'sustainability-reports' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can delete their own sustainability reports"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'sustainability-reports' AND (storage.foldername(name))[1] = auth.uid()::text);
