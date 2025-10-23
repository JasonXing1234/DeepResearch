-- Drop academic/study assistant tables and related infrastructure
-- Created to remove unused educational features

-- Drop tables in correct order (respecting foreign key dependencies)
DROP TABLE IF EXISTS messages CASCADE;
DROP TABLE IF EXISTS conversations CASCADE;
DROP TABLE IF EXISTS segments CASCADE;
DROP TABLE IF EXISTS documents CASCADE;
DROP TABLE IF EXISTS classes CASCADE;
DROP TABLE IF EXISTS semesters CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;

-- Drop semantic search function if it exists
DROP FUNCTION IF EXISTS match_segments(vector(1536), uuid, int, float);

-- Drop storage buckets for academic materials
-- Note: Storage bucket deletion may need to be done via Supabase dashboard or CLI
-- DELETE FROM storage.buckets WHERE id IN ('lecture-recordings', 'class-materials');
