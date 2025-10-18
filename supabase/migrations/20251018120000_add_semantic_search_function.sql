-- Add semantic search RPC function for vector similarity search
-- This function performs cosine similarity search on document segments using pgvector

CREATE OR REPLACE FUNCTION search_segments(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 20,
  filter_user_id uuid DEFAULT NULL,
  filter_class_id uuid DEFAULT NULL
)
RETURNS TABLE (
  content text,
  document_id uuid,
  document_title text,
  document_date date,
  class_name text,
  class_id uuid,
  segment_index int,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.content,
    s.document_id,
    d.title as document_title,
    d.date_of_material as document_date,
    c.name as class_name,
    s.class_id,
    s.segment_index,
    1 - (s.embedding <=> query_embedding) as similarity
  FROM segments s
  JOIN documents d ON d.id = s.document_id
  LEFT JOIN classes c ON c.id = s.class_id
  WHERE
    d.deleted_at IS NULL
    AND (filter_user_id IS NULL OR s.user_id = filter_user_id)
    AND (filter_class_id IS NULL OR s.class_id = filter_class_id)
    AND 1 - (s.embedding <=> query_embedding) >= match_threshold
  ORDER BY s.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Add comment for documentation
COMMENT ON FUNCTION search_segments IS 'Performs semantic search on document segments using cosine similarity. Returns segments ordered by relevance with similarity scores.';
