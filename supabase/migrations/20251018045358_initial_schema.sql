-- ============================================================================
-- AI Study Assistant - Initial Database Schema
-- ============================================================================
-- This migration creates a portable, production-ready schema for the study
-- assistant app with support for lecture recordings, document uploads,
-- vector embeddings, and chat conversations.
--
-- Key Design Principles:
-- 1. Auth portability - own profiles table, not tied to Supabase auth
-- 2. Storage portability - relative paths, not full URLs
-- 3. Async processing - status tracking for transcription/embedding pipeline
-- 4. Performance - indexes on critical lookups and vector search
-- 5. Security - full RLS policies with portable wrapper function
-- ============================================================================

-- ============================================================================
-- EXTENSIONS
-- ============================================================================

-- Enable pgvector for embeddings (required for vector similarity search)
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================================
-- UTILITY FUNCTIONS
-- ============================================================================

-- Portable wrapper for getting current user ID
-- This abstracts away Supabase's auth.uid() so we can migrate to other auth providers
CREATE OR REPLACE FUNCTION current_user_id()
RETURNS uuid AS $$
BEGIN
  -- Currently uses Supabase auth
  RETURN auth.uid();

  -- To migrate to another provider, change to:
  -- RETURN current_setting('app.user_id', true)::uuid;
  -- Then set session variable when user authenticates
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TABLES
-- ============================================================================

-- ----------------------------------------------------------------------------
-- PROFILES - User profile information
-- ----------------------------------------------------------------------------
-- Stores user data independent of auth provider for portability.
-- If switching from Supabase Auth to Clerk/Auth0/etc, you only need to
-- update the supabase_auth_id reference, not the entire app.

CREATE TABLE profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Auth provider reference (nullable for future migrations)
  supabase_auth_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Identity fields WE control (source of truth)
  email text UNIQUE NOT NULL,
  email_verified boolean DEFAULT false,
  full_name text,

  -- App-specific fields
  university text,
  major text,
  graduation_year integer,

  -- Metadata
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Trigger to auto-update updated_at
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Index for email lookups during auth
CREATE INDEX idx_profiles_email ON profiles(email);
CREATE INDEX idx_profiles_supabase_auth_id ON profiles(supabase_auth_id);

-- ----------------------------------------------------------------------------
-- CLASSES - Course/class information
-- ----------------------------------------------------------------------------
-- Stores information about classes/courses that users are taking.
-- Semester info stored directly on classes table (simpler than separate table).

CREATE TABLE classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Basic info
  name text NOT NULL,
  class_code text, -- e.g., "CS 101"
  description text,

  -- Semester info (stored inline, no separate semesters table)
  semester_year integer NOT NULL,
  semester_term text NOT NULL CHECK (semester_term IN ('Fall', 'Spring', 'Summer', 'Winter')),

  -- Instructor
  instructor text,

  -- Schedule (LLM-friendly string representations)
  class_time text, -- e.g., "MWF 10:00 AM - 11:00 AM"
  location text,   -- e.g., "Science Building Room 203"

  -- Metadata
  color_code text, -- Hex color for UI (e.g., "#3b82f6")

  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER classes_updated_at
  BEFORE UPDATE ON classes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Indexes for common queries
CREATE INDEX idx_classes_user_id ON classes(user_id);
CREATE INDEX idx_classes_semester ON classes(semester_year, semester_term);
CREATE INDEX idx_classes_archived ON classes(is_archived) WHERE is_archived = false;

-- ----------------------------------------------------------------------------
-- DOCUMENTS - Uploaded materials and lecture recordings
-- ----------------------------------------------------------------------------
-- Stores files (PDFs, slides, audio recordings, etc.) with comprehensive
-- metadata for tracking async processing pipeline and enabling portability.

CREATE TABLE documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,

  -- Basic info
  title text,
  is_lecture_notes boolean DEFAULT false,

  -- Storage info (PORTABLE: stores relative path, not full URL)
  -- This allows switching from Supabase Storage -> S3 -> R2 without DB migration
  storage_bucket text NOT NULL DEFAULT 'class-materials',
  file_path text NOT NULL, -- e.g., "user_123/class_456/doc_789.pdf"
  storage_provider text DEFAULT 'supabase', -- 'supabase', 's3', 'r2', etc.

  -- File metadata
  original_filename text, -- What user named it (we rename to UUID in storage)
  file_size_bytes bigint,
  mime_type text,

  -- Content metadata
  date_of_material date, -- When material is FROM (not when uploaded)

  -- Processing status tracking (for async pipeline)
  -- Pipeline: Upload -> Transcription (if audio) -> Chunking -> Embedding
  upload_status text DEFAULT 'completed' CHECK (upload_status IN ('pending', 'uploading', 'completed', 'failed')),
  transcription_status text DEFAULT 'pending' CHECK (transcription_status IN ('pending', 'processing', 'completed', 'failed', 'not_applicable')),
  embedding_status text DEFAULT 'pending' CHECK (embedding_status IN ('pending', 'processing', 'completed', 'failed')),

  -- Error handling
  error_message text,
  retry_count integer DEFAULT 0,

  -- Progress tracking (for UX)
  total_segments integer,
  processed_segments integer,

  -- Transcription-specific (for audio files)
  audio_duration_seconds integer,
  transcription_language text DEFAULT 'en',
  transcription_model text DEFAULT 'whisper-1',
  transcription_text text, -- The full transcription

  -- Content stats
  word_count integer,

  -- Timing metadata (critical for debugging async pipeline)
  upload_started_at timestamptz,
  upload_completed_at timestamptz,
  transcription_started_at timestamptz,
  transcription_completed_at timestamptz,
  embedding_started_at timestamptz,
  embedding_completed_at timestamptz,

  -- Soft delete (allows "undo" and compliance)
  deleted_at timestamptz,

  -- Versioning (if supporting file updates)
  version integer DEFAULT 1,
  previous_version_id uuid REFERENCES documents(id),

  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER documents_updated_at
  BEFORE UPDATE ON documents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Indexes for performance
CREATE INDEX idx_documents_user_id ON documents(user_id);
CREATE INDEX idx_documents_class_id ON documents(class_id);
CREATE INDEX idx_documents_user_class ON documents(user_id, class_id); -- Composite for common query
CREATE INDEX idx_documents_date_of_material ON documents(date_of_material);

-- Partial index for querying processing items (smaller, faster)
CREATE INDEX idx_documents_transcription_pending ON documents(transcription_status)
  WHERE transcription_status IN ('pending', 'processing');
CREATE INDEX idx_documents_embedding_pending ON documents(embedding_status)
  WHERE embedding_status IN ('pending', 'processing');

-- Index for soft-deleted items
CREATE INDEX idx_documents_deleted ON documents(deleted_at) WHERE deleted_at IS NOT NULL;

-- ----------------------------------------------------------------------------
-- SEGMENTS - Vectorized chunks for RAG (Retrieval Augmented Generation)
-- ----------------------------------------------------------------------------
-- Stores text chunks with embeddings for vector similarity search.
-- Each document is split into segments for better retrieval granularity.

CREATE TABLE segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,

  -- Content
  content text NOT NULL,
  embedding vector(1536), -- OpenAI text-embedding-3-small dimensions

  -- Position metadata (helpful for citations and context)
  page_number integer,
  segment_index integer NOT NULL, -- Order within document (0, 1, 2, ...)
  char_start integer,
  char_end integer,

  -- Embedding metadata
  embedding_model text DEFAULT 'text-embedding-3-small',

  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now()
);

-- CRITICAL: Vector similarity search index
-- Uses IVFFlat algorithm for fast approximate nearest neighbor search
-- Lists parameter should be ~sqrt(total_rows) for optimal performance
CREATE INDEX idx_segments_embedding ON segments
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Indexes for filtering before vector search
CREATE INDEX idx_segments_user_id ON segments(user_id);
CREATE INDEX idx_segments_class_id ON segments(class_id);
CREATE INDEX idx_segments_document_id ON segments(document_id);
CREATE INDEX idx_segments_document_index ON segments(document_id, segment_index);

-- ----------------------------------------------------------------------------
-- CONVERSATIONS - Chat conversation tracking
-- ----------------------------------------------------------------------------
-- Stores AI assistant conversations for context and history.

CREATE TABLE conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  class_id uuid REFERENCES classes(id) ON DELETE SET NULL, -- Optional: conversation can be class-specific

  -- Metadata
  title text, -- Auto-generated from first message or user-provided

  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER conversations_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_conversations_user_id ON conversations(user_id);
CREATE INDEX idx_conversations_class_id ON conversations(class_id);
CREATE INDEX idx_conversations_updated_at ON conversations(updated_at DESC); -- For "recent chats"

-- ----------------------------------------------------------------------------
-- MESSAGES - Individual chat messages
-- ----------------------------------------------------------------------------
-- Stores messages within conversations.

CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,

  -- Message content
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content text NOT NULL,

  -- Tool usage tracking (from your existing TypeScript type)
  tool_used text,

  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_messages_created_at ON messages(created_at); -- For ordering

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================
-- Security model: Users can only access their own data
-- Uses portable current_user_id() function instead of auth.uid() directly

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- PROFILES policies
-- ----------------------------------------------------------------------------

CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (current_user_id() = supabase_auth_id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (current_user_id() = supabase_auth_id)
  WITH CHECK (current_user_id() = supabase_auth_id);

-- Allow users to insert their own profile (for signup)
CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (current_user_id() = supabase_auth_id);

-- ----------------------------------------------------------------------------
-- CLASSES policies
-- ----------------------------------------------------------------------------

CREATE POLICY "Users can view own classes"
  ON classes FOR SELECT
  USING (current_user_id() = (SELECT supabase_auth_id FROM profiles WHERE id = user_id));

CREATE POLICY "Users can insert own classes"
  ON classes FOR INSERT
  WITH CHECK (current_user_id() = (SELECT supabase_auth_id FROM profiles WHERE id = user_id));

CREATE POLICY "Users can update own classes"
  ON classes FOR UPDATE
  USING (current_user_id() = (SELECT supabase_auth_id FROM profiles WHERE id = user_id))
  WITH CHECK (current_user_id() = (SELECT supabase_auth_id FROM profiles WHERE id = user_id));

CREATE POLICY "Users can delete own classes"
  ON classes FOR DELETE
  USING (current_user_id() = (SELECT supabase_auth_id FROM profiles WHERE id = user_id));

-- ----------------------------------------------------------------------------
-- DOCUMENTS policies
-- ----------------------------------------------------------------------------

CREATE POLICY "Users can view own documents"
  ON documents FOR SELECT
  USING (current_user_id() = (SELECT supabase_auth_id FROM profiles WHERE id = user_id));

CREATE POLICY "Users can insert own documents"
  ON documents FOR INSERT
  WITH CHECK (current_user_id() = (SELECT supabase_auth_id FROM profiles WHERE id = user_id));

CREATE POLICY "Users can update own documents"
  ON documents FOR UPDATE
  USING (current_user_id() = (SELECT supabase_auth_id FROM profiles WHERE id = user_id))
  WITH CHECK (current_user_id() = (SELECT supabase_auth_id FROM profiles WHERE id = user_id));

CREATE POLICY "Users can delete own documents"
  ON documents FOR DELETE
  USING (current_user_id() = (SELECT supabase_auth_id FROM profiles WHERE id = user_id));

-- ----------------------------------------------------------------------------
-- SEGMENTS policies
-- ----------------------------------------------------------------------------

CREATE POLICY "Users can view own segments"
  ON segments FOR SELECT
  USING (current_user_id() = (SELECT supabase_auth_id FROM profiles WHERE id = user_id));

CREATE POLICY "Users can insert own segments"
  ON segments FOR INSERT
  WITH CHECK (current_user_id() = (SELECT supabase_auth_id FROM profiles WHERE id = user_id));

CREATE POLICY "Users can update own segments"
  ON segments FOR UPDATE
  USING (current_user_id() = (SELECT supabase_auth_id FROM profiles WHERE id = user_id))
  WITH CHECK (current_user_id() = (SELECT supabase_auth_id FROM profiles WHERE id = user_id));

CREATE POLICY "Users can delete own segments"
  ON segments FOR DELETE
  USING (current_user_id() = (SELECT supabase_auth_id FROM profiles WHERE id = user_id));

-- ----------------------------------------------------------------------------
-- CONVERSATIONS policies
-- ----------------------------------------------------------------------------

CREATE POLICY "Users can view own conversations"
  ON conversations FOR SELECT
  USING (current_user_id() = (SELECT supabase_auth_id FROM profiles WHERE id = user_id));

CREATE POLICY "Users can insert own conversations"
  ON conversations FOR INSERT
  WITH CHECK (current_user_id() = (SELECT supabase_auth_id FROM profiles WHERE id = user_id));

CREATE POLICY "Users can update own conversations"
  ON conversations FOR UPDATE
  USING (current_user_id() = (SELECT supabase_auth_id FROM profiles WHERE id = user_id))
  WITH CHECK (current_user_id() = (SELECT supabase_auth_id FROM profiles WHERE id = user_id));

CREATE POLICY "Users can delete own conversations"
  ON conversations FOR DELETE
  USING (current_user_id() = (SELECT supabase_auth_id FROM profiles WHERE id = user_id));

-- ----------------------------------------------------------------------------
-- MESSAGES policies
-- ----------------------------------------------------------------------------
-- Messages inherit permissions from conversations

CREATE POLICY "Users can view messages from own conversations"
  ON messages FOR SELECT
  USING (
    current_user_id() = (
      SELECT p.supabase_auth_id
      FROM conversations c
      JOIN profiles p ON c.user_id = p.id
      WHERE c.id = conversation_id
    )
  );

CREATE POLICY "Users can insert messages to own conversations"
  ON messages FOR INSERT
  WITH CHECK (
    current_user_id() = (
      SELECT p.supabase_auth_id
      FROM conversations c
      JOIN profiles p ON c.user_id = p.id
      WHERE c.id = conversation_id
    )
  );

CREATE POLICY "Users can update messages in own conversations"
  ON messages FOR UPDATE
  USING (
    current_user_id() = (
      SELECT p.supabase_auth_id
      FROM conversations c
      JOIN profiles p ON c.user_id = p.id
      WHERE c.id = conversation_id
    )
  )
  WITH CHECK (
    current_user_id() = (
      SELECT p.supabase_auth_id
      FROM conversations c
      JOIN profiles p ON c.user_id = p.id
      WHERE c.id = conversation_id
    )
  );

CREATE POLICY "Users can delete messages from own conversations"
  ON messages FOR DELETE
  USING (
    current_user_id() = (
      SELECT p.supabase_auth_id
      FROM conversations c
      JOIN profiles p ON c.user_id = p.id
      WHERE c.id = conversation_id
    )
  );

-- ============================================================================
-- INITIAL SETUP
-- ============================================================================

-- Create storage buckets (if using Supabase Storage)
-- Note: This section may need to be run separately via Supabase Dashboard
-- as CREATE BUCKET is not standard SQL

-- INSERT INTO storage.buckets (id, name, public)
-- VALUES
--   ('lecture-recordings', 'lecture-recordings', false),
--   ('class-materials', 'class-materials', false);

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- Run this migration with: npx supabase db reset
-- Push to cloud with: npx supabase db push (after linking project)
