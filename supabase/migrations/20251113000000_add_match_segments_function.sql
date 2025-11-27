-- Create match_segments function for vector similarity search
-- This function is used by the research chat APIs

CREATE OR REPLACE FUNCTION match_segments(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.5,
  match_count integer DEFAULT 10,
  filter_segment_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  content text,
  similarity float
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id,
    s.content,
    1 - (s.embedding <=> query_embedding) as similarity
  FROM segments s
  WHERE
    (filter_segment_ids IS NULL OR s.id = ANY(filter_segment_ids))
    AND (1 - (s.embedding <=> query_embedding)) >= match_threshold
  ORDER BY s.embedding <=> query_embedding
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql;
