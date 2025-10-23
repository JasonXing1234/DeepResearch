-- ============================================================================
-- Research Queue System
-- ============================================================================
-- Creates tables for storing research history with links to vectorized documents
-- Enables tracking of research jobs and their associated documents/segments

-- ============================================================================
-- RESEARCH QUEUE TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS research_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Research job metadata
  companies text[] NOT NULL, -- Array of company names researched
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),

  -- Results storage
  project_id uuid REFERENCES sustainability_projects(id) ON DELETE SET NULL,

  -- Timing
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,

  -- Error tracking
  error_message text,

  -- Metadata
  total_companies integer NOT NULL DEFAULT 0,
  files_generated integer DEFAULT 0,

  CONSTRAINT companies_not_empty CHECK (array_length(companies, 1) > 0)
);

-- Indexes for efficient querying
CREATE INDEX idx_research_queue_user_id ON research_queue(user_id);
CREATE INDEX idx_research_queue_status ON research_queue(status);
CREATE INDEX idx_research_queue_created_at ON research_queue(created_at DESC);
CREATE INDEX idx_research_queue_project_id ON research_queue(project_id);

-- Trigger for updated_at
CREATE TRIGGER research_queue_updated_at
  BEFORE UPDATE ON research_queue
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- RESEARCH DOCUMENTS TABLE
-- ============================================================================
-- Links research queue entries to documents that were created and vectorized

CREATE TABLE IF NOT EXISTS research_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  research_id uuid NOT NULL REFERENCES research_queue(id) ON DELETE CASCADE,

  -- Document metadata
  company_name text NOT NULL,
  category text NOT NULL
    CHECK (category IN ('emissions', 'investments', 'machine_purchases', 'pilot_projects', 'project_environments')),

  -- Storage reference
  storage_bucket text NOT NULL,
  file_path text NOT NULL,
  file_size_bytes bigint,
  mime_type text NOT NULL,

  -- Vectorization status
  vectorization_status text NOT NULL DEFAULT 'pending'
    CHECK (vectorization_status IN ('pending', 'processing', 'completed', 'failed')),

  -- Link to segments for RAG
  segment_count integer DEFAULT 0,

  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_research_documents_research_id ON research_documents(research_id);
CREATE INDEX idx_research_documents_company ON research_documents(company_name);
CREATE INDEX idx_research_documents_category ON research_documents(category);
CREATE INDEX idx_research_documents_vectorization_status ON research_documents(vectorization_status);

-- Trigger for updated_at
CREATE TRIGGER research_documents_updated_at
  BEFORE UPDATE ON research_documents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- RESEARCH SEGMENTS TABLE
-- ============================================================================
-- Links research documents to their vector embeddings in the segments table

CREATE TABLE IF NOT EXISTS research_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  research_document_id uuid NOT NULL REFERENCES research_documents(id) ON DELETE CASCADE,
  segment_id uuid NOT NULL REFERENCES segments(id) ON DELETE CASCADE,

  -- Quick reference fields (denormalized for performance)
  company_name text NOT NULL,
  category text NOT NULL,

  created_at timestamptz NOT NULL DEFAULT now(),

  -- Ensure unique mapping
  UNIQUE(research_document_id, segment_id)
);

-- Indexes for efficient lookups
CREATE INDEX idx_research_segments_research_document_id ON research_segments(research_document_id);
CREATE INDEX idx_research_segments_segment_id ON research_segments(segment_id);
CREATE INDEX idx_research_segments_company_category ON research_segments(company_name, category);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to get research history with document counts
CREATE OR REPLACE FUNCTION get_research_history(
  p_user_id uuid,
  p_limit integer DEFAULT 10,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  companies text[],
  status text,
  project_id uuid,
  created_at timestamptz,
  completed_at timestamptz,
  total_companies integer,
  files_generated integer,
  document_count bigint,
  segment_count bigint
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    rq.id,
    rq.companies,
    rq.status,
    rq.project_id,
    rq.created_at,
    rq.completed_at,
    rq.total_companies,
    rq.files_generated,
    COUNT(DISTINCT rd.id) as document_count,
    SUM(rd.segment_count) as segment_count
  FROM research_queue rq
  LEFT JOIN research_documents rd ON rd.research_id = rq.id
  WHERE rq.user_id = p_user_id
  GROUP BY rq.id
  ORDER BY rq.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

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
    -- Vector similarity search
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
    -- Simple text search
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

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE research_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_segments ENABLE ROW LEVEL SECURITY;

-- Research Queue Policies
CREATE POLICY "Users can view own research queue"
  ON research_queue FOR SELECT
  USING (user_id = current_user_id());

CREATE POLICY "Users can insert own research queue"
  ON research_queue FOR INSERT
  WITH CHECK (user_id = current_user_id());

CREATE POLICY "Users can update own research queue"
  ON research_queue FOR UPDATE
  USING (user_id = current_user_id());

CREATE POLICY "Users can delete own research queue"
  ON research_queue FOR DELETE
  USING (user_id = current_user_id());

-- Research Documents Policies
CREATE POLICY "Users can view own research documents"
  ON research_documents FOR SELECT
  USING (research_id IN (
    SELECT id FROM research_queue WHERE user_id = current_user_id()
  ));

CREATE POLICY "Users can insert own research documents"
  ON research_documents FOR INSERT
  WITH CHECK (research_id IN (
    SELECT id FROM research_queue WHERE user_id = current_user_id()
  ));

CREATE POLICY "Users can update own research documents"
  ON research_documents FOR UPDATE
  USING (research_id IN (
    SELECT id FROM research_queue WHERE user_id = current_user_id()
  ));

CREATE POLICY "Users can delete own research documents"
  ON research_documents FOR DELETE
  USING (research_id IN (
    SELECT id FROM research_queue WHERE user_id = current_user_id()
  ));

-- Research Segments Policies
CREATE POLICY "Users can view own research segments"
  ON research_segments FOR SELECT
  USING (research_document_id IN (
    SELECT rd.id FROM research_documents rd
    JOIN research_queue rq ON rq.id = rd.research_id
    WHERE rq.user_id = current_user_id()
  ));

CREATE POLICY "Users can insert own research segments"
  ON research_segments FOR INSERT
  WITH CHECK (research_document_id IN (
    SELECT rd.id FROM research_documents rd
    JOIN research_queue rq ON rq.id = rd.research_id
    WHERE rq.user_id = current_user_id()
  ));

CREATE POLICY "Users can delete own research segments"
  ON research_segments FOR DELETE
  USING (research_document_id IN (
    SELECT rd.id FROM research_documents rd
    JOIN research_queue rq ON rq.id = rd.research_id
    WHERE rq.user_id = current_user_id()
  ));

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE research_queue IS 'Queue of research jobs with status tracking and history';
COMMENT ON TABLE research_documents IS 'Documents generated from research, linked to queue entries';
COMMENT ON TABLE research_segments IS 'Links research documents to their vector embeddings';
COMMENT ON FUNCTION get_research_history IS 'Get paginated research history with document/segment counts';
COMMENT ON FUNCTION search_research_segments IS 'Search research segments by company and category with optional vector similarity';
