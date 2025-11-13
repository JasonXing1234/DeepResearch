-- Enable pgvector extension for vector embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- Create segments table for storing document chunks with embeddings
CREATE TABLE IF NOT EXISTS segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Foreign keys
  user_id uuid NOT NULL,
  class_id uuid,
  document_id uuid,

  -- Content of the segment
  content text NOT NULL,

  -- Vector embedding for semantic search (1536 dimensions for text-embedding-3-small)
  embedding vector(1536),

  -- Metadata
  segment_index integer NOT NULL,
  char_start integer,
  char_end integer,
  token_count integer,
  embedding_model text DEFAULT 'text-embedding-3-small',

  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Constraints
  CONSTRAINT content_not_empty CHECK (length(content) > 0)
);

-- Indexes for performance
CREATE INDEX idx_segments_user_id ON segments(user_id);
CREATE INDEX idx_segments_document_id ON segments(document_id);
CREATE INDEX idx_segments_created_at ON segments(created_at DESC);
CREATE INDEX idx_segments_embedding ON segments USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Trigger for updated_at
CREATE TRIGGER segments_updated_at
  BEFORE UPDATE ON segments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Create research_segments junction table
CREATE TABLE IF NOT EXISTS research_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  research_document_id uuid NOT NULL REFERENCES research_documents(id) ON DELETE CASCADE,
  segment_id uuid NOT NULL REFERENCES segments(id) ON DELETE CASCADE,

  company_name text NOT NULL,
  category text NOT NULL,

  created_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE(research_document_id, segment_id)
);

-- Indexes for research_segments
CREATE INDEX idx_research_segments_research_document_id ON research_segments(research_document_id);
CREATE INDEX idx_research_segments_segment_id ON research_segments(segment_id);
CREATE INDEX idx_research_segments_company_category ON research_segments(company_name, category);

-- Disable RLS for dev
ALTER TABLE segments DISABLE ROW LEVEL SECURITY;
ALTER TABLE research_segments DISABLE ROW LEVEL SECURITY;

-- Function to search research segments by company and category
CREATE OR REPLACE FUNCTION search_research_segments(
  p_user_id uuid,
  p_company_name text,
  p_category text DEFAULT NULL,
  p_query_embedding vector(1536) DEFAULT NULL,
  p_limit integer DEFAULT 10
)
RETURNS TABLE (
  segment_id uuid,
  research_id uuid,
  company_name text,
  category text,
  content text,
  similarity float
) AS $$
BEGIN
  IF p_query_embedding IS NOT NULL THEN
    RETURN QUERY
    SELECT
      s.id as segment_id,
      rq.id as research_id,
      rs.company_name,
      rs.category,
      s.content,
      1 - (s.embedding <=> p_query_embedding) as similarity
    FROM research_segments rs
    JOIN segments s ON s.id = rs.segment_id
    JOIN research_documents rd ON rd.id = rs.research_document_id
    JOIN research_queue rq ON rq.id = rd.research_id
    WHERE rq.user_id = p_user_id
      AND rs.company_name = p_company_name
      AND (p_category IS NULL OR rs.category = p_category)
    ORDER BY s.embedding <=> p_query_embedding
    LIMIT p_limit;
  ELSE
    RETURN QUERY
    SELECT
      s.id as segment_id,
      rq.id as research_id,
      rs.company_name,
      rs.category,
      s.content,
      0.0 as similarity
    FROM research_segments rs
    JOIN segments s ON s.id = rs.segment_id
    JOIN research_documents rd ON rd.id = rs.research_document_id
    JOIN research_queue rq ON rq.id = rd.research_id
    WHERE rq.user_id = p_user_id
      AND rs.company_name = p_company_name
      AND (p_category IS NULL OR rs.category = p_category)
    ORDER BY s.created_at DESC
    LIMIT p_limit;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
