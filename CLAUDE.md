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

## Architecture

### Data Model (defined in src/app/page.tsx)

The application uses a hierarchical data structure:
- **Semester** → Contains multiple Classes
- **Class** → Contains Lectures and ClassMaterials
- **Lecture** → Has transcript, audio, title, date, duration
- **ClassMaterial** → PDFs, presentations, documents associated with a class

All data is currently mocked in `src/app/page.tsx` (see `mockSemesters`, `mockClasses`, `mockLectures`, `mockMaterials`).

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

## Current Limitations & TODOs

1. **AI Chat Not Connected**: The StudyAssistant component returns mock responses. The `/api/chat` endpoint exists but isn't wired up to the UI.

2. **Database Not Integrated**: Supabase is configured but not yet integrated. All data is still in-memory mock data. Need to:
   - Create database schema/migrations for Semesters, Classes, Lectures, ClassMaterials
   - Replace mock data with actual Supabase queries
   - Set up Row Level Security (RLS) policies

3. **Recording Interface**: RecordingView is UI-only, no actual audio recording or transcription.

4. **File Storage**: Storage abstraction is configured but not integrated with upload/recording UIs.

5. **Authentication Not Implemented**: Supabase Auth is configured but no auth UI exists.

6. **Environment Variables**: Check `.env.local` for API keys (not committed to git).

## Key Implementation Details

- The app maintains a single active semester (indicated by `isActive` flag)
- Class colors are stored as hex codes in the Class type
- Lecture durations are in seconds
- File sizes are in bytes
- The chat interface includes a tools sidebar with predefined study tools (search, summarize, quiz, flashcards, study guide, explain)
- Path alias `@/` is configured to point to `src/`
