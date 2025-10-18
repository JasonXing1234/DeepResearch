# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Next.js-based AI-powered study assistant application for students. It allows users to record lectures, upload class materials, and interact with an AI assistant that has access to lecture transcripts and course content. The application is currently using mock data and the AI chat interface is non-functional (returns mock responses).

## Tech Stack

- **Framework**: Next.js 15.5.6 with App Router
- **Language**: TypeScript (strict mode)
- **UI**: React 19.1.0 with Radix UI components and Tailwind CSS 4
- **Database**: Supabase (PostgreSQL) with local development support
- **Auth**: Supabase Auth with SSR support (@supabase/ssr)
- **AI Integration**: Vercel AI SDK (@ai-sdk/openai, @ai-sdk/react)
- **Build Tool**: Turbopack (--turbopack flag enabled)
- **Path Alias**: `@/*` maps to `./src/*`

## Development Commands

```bash
# Start development server with Turbopack
npm run dev

# Build for production with Turbopack
npm run build

# Start production server
npm start

# Run linter
npm run lint

# Supabase local development
npx supabase start    # Start local Supabase (requires Docker)
npx supabase stop     # Stop local Supabase
npx supabase status   # Check status and get credentials
npx supabase db reset # Reset local database and run migrations
```

## Supabase Setup

### Local Development

The project uses Supabase for database and authentication. Local development uses a local Supabase instance running in Docker.

**Prerequisites**: Docker must be running

**Starting Supabase locally**:
```bash
npx supabase start
```

This will output local credentials including:
- API URL: `http://127.0.0.1:54321`
- Publishable Key
- Database URL
- Studio URL (local dashboard)

The credentials are automatically configured in `.env.local` for local development.

**Supabase utilities** (following Next.js App Router SSR patterns):
- `src/lib/supabase/client.ts` - Client-side Supabase client (for Client Components)
- `src/lib/supabase/server.ts` - Server-side Supabase client (for Server Components, Route Handlers)
- `src/lib/supabase/middleware.ts` - Session refresh logic
- `src/middleware.ts` - Next.js middleware that calls Supabase session update

**Version Control**:
- `supabase/` folder contains migrations, seed files, and `config.toml`
- All database schema changes should be created as migrations
- Migrations are version-controlled and can be applied to cloud instance

### Linking to Cloud Supabase

When ready to deploy:
1. Create a Supabase project at https://supabase.com
2. Link local project: `npx supabase link --project-ref your-project-ref`
3. Push migrations: `npx supabase db push`
4. Update Vercel environment variables with cloud credentials:
   - `NEXT_PUBLIC_SUPABASE_URL` → Your project URL (e.g., `https://xxx.supabase.co`)
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` → Your cloud publishable key

### Creating Migrations

```bash
# Create a new migration file
npx supabase migration new migration_name

# Apply migrations locally
npx supabase db reset

# Push migrations to cloud (after linking)
npx supabase db push
```

## Inngest Queue System

The application uses Inngest for background job processing (transcription, PDF text extraction, embedding generation).

### Local Development

**Prerequisites**:
- Docker running (for Supabase)
- Inngest dev server

**Starting the full development environment**:
```bash
# Terminal 1: Start Next.js dev server
npm run dev

# Terminal 2: Start Inngest dev server (required for background jobs)
npx inngest-cli@latest dev
```

**Inngest Dashboard**: http://localhost:8288
- View all jobs, retries, failures
- Manually trigger events for testing
- See step-by-step execution

**Inngest Client** (`src/inngest/client.ts`):
- App ID: `study-assistant`
- Event key optional in development (required for production)
- Functions registered at `/api/inngest` endpoint

### Processing Pipeline

**Audio Files (Lectures)**:
```
1. POST /api/upload-audio
   ├─ Store audio in lecture-recordings bucket
   ├─ Create document record (status: pending)
   └─ Trigger event: "audio/uploaded"

2. Inngest: processAudio
   ├─ Download audio file
   ├─ Call OpenAI Whisper API
   ├─ Save transcript to transcripts bucket
   └─ Trigger event: "transcript/created"

3. Inngest: processTranscript
   ├─ Download transcript
   ├─ Chunk text (500 tokens, 50 overlap)
   ├─ Generate embeddings (batched)
   └─ Insert into segments table
```

**PDF Files (Materials)**:
```
1. POST /api/upload-pdf
   ├─ Store PDF in class-materials bucket
   ├─ Create document record (status: pending)
   └─ Trigger event: "pdf/uploaded"

2. ⚠️ Inngest: processPDF (NOT YET IMPLEMENTED)
   ├─ Download PDF file
   ├─ Extract text with pdf-parse
   ├─ Save transcript to transcripts bucket
   └─ Trigger event: "transcript/created"

3. Inngest: processTranscript (same as audio)
   ├─ Chunk and generate embeddings
   └─ Insert into segments table
```

**Note**: PDF text extraction pipeline is incomplete. The upload endpoint works, but the Inngest function to extract text from PDFs needs to be created.

### Storage Buckets

**Bucket Structure**:
```
lecture-recordings/   # Original audio files
  └─ {user_id}/{class_id}/{document_id}.mp3

class-materials/      # Original PDFs
  └─ {user_id}/{class_id}/{document_id}.pdf

transcripts/          # Extracted text (both audio and PDF)
  └─ {user_id}/{class_id}/{document_id}.txt
```

**Key Design Pattern**:
- Original files stored in their respective buckets
- Transcripts stored separately in `transcripts/` bucket
- Transcript path derived from original path (same structure, .txt extension)
- Database stores path to original file only; transcript path computed via `getTranscriptPath()`

### Inngest Functions

- **process-audio.ts** - Whisper transcription for audio files (triggered by `audio/uploaded` event)
- **process-transcript.ts** - Shared chunking/embedding pipeline (triggered by `transcript/created` event)
- **process-pdf.ts** - ⚠️ NOT YET IMPLEMENTED (upload-pdf route triggers `pdf/uploaded` event but no handler exists)

All functions include:
- Automatic retries (3 attempts)
- Error handling with database status updates
- Progress tracking in database
- Concurrency limits for OpenAI API rate limiting

### Monitoring Jobs

**Database Status Fields**:
```sql
-- Check document processing status
SELECT
  id,
  title,
  transcription_status,  -- pending, processing, completed, failed
  embedding_status,      -- pending, processing, completed, failed
  error_message
FROM documents;

-- Check progress
SELECT
  id,
  total_segments,
  processed_segments
FROM documents
WHERE embedding_status = 'processing';
```

**Inngest Dashboard** (http://localhost:8288):
- Real-time job status
- Step-by-step execution logs
- Retry history
- Failure details

### Testing

**Prerequisites**:
1. Create storage buckets via Supabase Dashboard (http://127.0.0.1:54323) > Storage:
   - `lecture-recordings` (private)
   - `class-materials` (private)
   - `transcripts` (private)

2. Create a test class (needed for uploads):
   ```sql
   -- Via Supabase SQL Editor or psql
   INSERT INTO classes (user_id, name, class_code, semester_id)
   VALUES (
     'b2bbb440-1d79-42fa-81e3-069efd22fae8',  -- Hardcoded dev user
     'Test Class',
     'CS 101',
     NULL
   );
   -- Note the returned UUID
   ```

**Test audio upload**:
```bash
curl -X POST http://localhost:3000/api/upload-audio \
  -F "audio=@test.mp3" \
  -F "classId=YOUR_CLASS_UUID" \
  -F "title=Test Lecture"
```

**Test PDF upload**:
```bash
curl -X POST http://localhost:3000/api/upload-pdf \
  -F "pdf=@test.pdf" \
  -F "classId=YOUR_CLASS_UUID" \
  -F "title=Test Document"
```

**Monitor processing**:
1. Check Inngest Dashboard: http://localhost:8288
2. Query database:
   ```sql
   SELECT id, title, transcription_status, embedding_status, error_message
   FROM documents
   ORDER BY created_at DESC;
   ```

**Note**: Auth is currently disabled (hardcoded user), so no Authorization header needed.

### Production Deployment

1. **Sign up for Inngest**: https://inngest.com (free tier available)
2. **Get keys**: Event Key and Signing Key
3. **Set environment variables** in Vercel:
   ```
   INNGEST_EVENT_KEY=your-event-key
   INNGEST_SIGNING_KEY=your-signing-key
   ```
4. **Create storage buckets** in production Supabase
5. Deploy to Vercel

Inngest will automatically discover your functions at `/api/inngest` endpoint.

## Architecture

### Data Model

The application uses a hierarchical data structure stored in Supabase PostgreSQL:

**Database Tables** (see `supabase/migrations/20251018045358_initial_schema.sql`):
- **profiles** - User profiles (portable auth abstraction)
- **semesters** - Academic semesters (year + term like "Fall 2024")
- **classes** - Courses within semesters
- **documents** - Uploaded files (lectures, PDFs) with processing status tracking
- **segments** - Text chunks with vector embeddings for RAG
- **conversations** - Chat conversation history
- **messages** - Individual messages within conversations

**Key Design Principles**:
- Portable auth via `profiles` table (not directly tied to Supabase auth)
- Relative storage paths (not full URLs) for portability
- Async processing tracked via status fields (pending → processing → completed/failed)
- Vector search enabled via pgvector extension (text-embedding-3-small, 1536 dimensions)
- RLS policies defined but **currently DISABLED** for development (lines 353-359 in schema)

**Frontend Types** (defined in `src/app/page.tsx`):
- `Semester` - Maps to semesters table
- `Class` - Maps to classes table
- `Lecture` - Subset of documents table (where is_lecture_notes = true or audio files)
- `ClassMaterial` - Subset of documents table (PDFs, slides, etc.)

The frontend fetches data from `/api/semesters`, `/api/classes`, and `/api/documents` on mount.

### View System

The app uses a view-based navigation system controlled by state in `src/app/page.tsx`:
- `'record'` → RecordingView component
- `'upload'` → UploadMaterialsView component
- `'class'` → ClassView component (shows lectures and materials for a selected class)
- `'study'` → StudyAssistant component (AI chat interface)

### Component Structure

- `src/app/page.tsx` - Main app component with state management and view routing
- `src/components/Sidebar.tsx` - Navigation sidebar with semester/class selection
- `src/components/StudyAssistant.tsx` - AI chat interface with study tools (currently returns mock responses)
- `src/components/RecordingView.tsx` - Lecture recording interface (UI only, no actual audio recording)
- `src/components/ClassView.tsx` - Display lectures and materials for a class
- `src/components/UploadMaterialsView.tsx` - File upload interface for class materials
- `src/components/LectureDetail.tsx` - Individual lecture view with transcript
- `src/components/ui/*` - Radix UI components (shadcn-style)

### API Routes

- `src/app/api/chat/route.ts` - Chat API endpoint using Vercel AI SDK (configured for OpenAI GPT-4.1)
  - Currently not connected to the frontend
  - System prompt: "You are a helpful assistant."
  - Max duration: 30 seconds
- `src/app/api/upload-audio/route.ts` - Audio file upload for lectures
- `src/app/api/upload-pdf/route.ts` - PDF file upload for materials
- `src/app/api/inngest/route.ts` - Inngest webhook endpoint (serves Inngest functions)
- `src/app/api/semesters/route.ts` - CRUD for semesters
- `src/app/api/classes/route.ts` - CRUD for classes
- `src/app/api/documents/route.ts` - Fetch documents (lectures and materials)

### Utility Libraries

**Storage** (`src/lib/storage.ts`):
- `getTranscriptPath()` - Converts original file path to transcript path (.txt extension)
- `getOriginalFile()` - Returns bucket and path for original file
- `getTranscriptFile()` - Returns bucket and path for transcript (always in 'transcripts' bucket)
- `buildStoragePath()` - Generates storage path: `{userId}/{classId}/{documentId}.{ext}`

**Chunking** (`src/lib/chunking.ts`):
- `chunkText()` - Basic character-based chunking with overlap
- `chunkTextSmart()` - Sentence-boundary-aware chunking (preferred)
- Default: 500 tokens (~2000 chars) with 50 token overlap (~200 chars)
- Returns `TextChunk[]` with content, charStart, charEnd, segmentIndex

**Embeddings** (`src/lib/embeddings.ts`):
- `generateEmbeddings()` - Batch embedding generation (up to 100 texts per request)
- `generateSingleEmbedding()` - Single text embedding
- `formatEmbeddingForPostgres()` - Formats array as `[0.1,0.2,...]` for pgvector
- Model: `text-embedding-3-small` (1536 dimensions)
- Supports progress callbacks for UX updates

**Supabase Clients** (following Next.js App Router SSR patterns):
- `src/lib/supabase/client.ts` - Client-side (for Client Components)
- `src/lib/supabase/server.ts` - Server-side (for Server Components, Route Handlers)
- `src/lib/supabase/middleware.ts` - Session refresh logic for middleware

### Database Schema Details

**Important Status Fields** (for tracking async processing):
- `upload_status`: 'pending' | 'uploading' | 'completed' | 'failed'
- `transcription_status`: 'pending' | 'processing' | 'completed' | 'failed' | 'not_applicable'
- `embedding_status`: 'pending' | 'processing' | 'completed' | 'failed'

**Portable Design Patterns**:
- `current_user_id()` function abstracts auth provider (currently uses Supabase auth.uid())
- Storage paths are relative (e.g., `user_123/class_456/doc.pdf`), not full URLs
- `storage_provider` field allows migrating between Supabase Storage, S3, R2, etc.
- Profiles table is source of truth for user data, not auth.users

**Vector Search** (pgvector):
- Extension enabled in migration
- IVFFlat index on `segments.embedding` with cosine similarity
- Query pattern: `ORDER BY embedding <=> '[...]' LIMIT 10`
- Index uses 100 lists (optimize when data grows: ~sqrt(total_rows))

**Soft Deletes**:
- Documents have `deleted_at` field for "undo" functionality
- Partial index created for querying soft-deleted items

## Current Limitations & TODOs

1. **PDF Processing Incomplete**: Upload endpoint exists and triggers `pdf/uploaded` event, but the Inngest handler (`process-pdf.ts`) needs to be created to extract text using pdf-parse library.

2. **AI Chat Not Connected to Documents**: The StudyAssistant component and `/api/chat` endpoint exist but don't perform RAG queries against the segments table. Need to:
   - Generate embedding for user query
   - Search segments table using vector similarity
   - Include relevant context in chat prompt

3. **Recording Interface**: RecordingView is UI-only, no actual browser-based audio recording implemented.

4. **Authentication Disabled**: Using hardcoded user ID (`b2bbb440-1d79-42fa-81e3-069efd22fae8`) in upload routes. Auth UI and real user sessions need to be implemented.

5. **RLS Disabled**: Row Level Security policies are defined in schema but explicitly disabled (for development). Must be re-enabled before production.

6. **Frontend-Backend Mapping**: Documents API returns all documents; frontend needs to properly filter/map them to Lectures vs Materials based on file type or `is_lecture_notes` flag.

7. **Environment Variables**: Check `.env.local` for API keys (not committed to git). Required keys:
   - `OPENAI_API_KEY` - For Whisper transcription and embeddings
   - `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` - Supabase anon key
   - `INNGEST_EVENT_KEY` - For production deployment (optional locally)
   - `INNGEST_SIGNING_KEY` - For production deployment (optional locally)

## Key Implementation Details

- The app maintains a single active semester (indicated by `isActive` flag)
- Class colors are stored as hex codes in the Class type
- Lecture durations are in seconds
- File sizes are in bytes
- The chat interface includes a tools sidebar with predefined study tools (search, summarize, quiz, flashcards, study guide, explain)
- Path alias `@/` is configured to point to `src/`
