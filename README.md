# DeepResearch AI

A Next.js-based research and sustainability analysis platform that leverages AI to help analyze documents, conduct research, and manage sustainability projects.

## Getting Started

### Prerequisites

- Node.js (v20 or higher)
- npm or yarn
- Supabase CLI
- Inngest CLI (optional for local development)

### Installation

1. Clone the repository and install dependencies:

```bash
npm install
```

2. Set up environment variables:

```bash
cp .env.example .env.local
```

Edit `.env.local` with your actual API keys:
- NEXT_PUBLIC_SUPABASE_URL - Your Supabase project URL
- NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY - Your Supabase anon key
- OPENAI_API_KEY - OpenAI API key for AI features
- INNGEST_EVENT_KEY - Inngest event key (optional for local dev)
- INNGEST_SIGNING_KEY - Inngest signing key (optional for local dev)
- TAVILY_API_KEY - Tavily API key for web search functionality

## Running the Project

### 1. Start Supabase (Local Development)

Start the local Supabase instance:

```bash
npx supabase start
```

This will start PostgreSQL, Storage, and other Supabase services locally on port 54321.

To stop Supabase:

```bash
npx supabase stop
```

### 2. Start the Next.js Development Server

Run the frontend application:

```bash
npm run dev
```

The application will be available at http://localhost:3000

### 3. Start Inngest Dev Server (Optional)

For background job processing (document analysis, research workflows), start the Inngest dev server:

```bash
npx inngest-cli dev
```

This will start the Inngest dashboard at http://localhost:8288

## Project Structure

The project follows a standard Next.js 15 App Router structure:

**src/app/** - Contains all pages and API routes using Next.js App Router

**src/app/api/** - API endpoints for the application including inngest webhooks, research chat, research queue management, and sustainability analysis APIs

**src/components/** - React components organized into modules (DashboardAssistant, DeepResearchEngine, ResearchChat, etc.), sustainability-specific components, and UI primitives from shadcn/ui

**src/contexts/** - React Context providers for state management, including ResearchContext for research state

**src/inngest/** - Inngest background job configurations and functions for processing research documents and sustainability analysis

**src/lib/** - Utility libraries including Supabase client configurations (client-side, server-side, middleware, and service role), document chunking, embeddings, web search integration, and general utilities

**supabase/** - Supabase configuration files including config.toml and database migrations

## Key Features

- Deep Research Engine: AI-powered research with web search and document analysis
- Sustainability Dashboard: Upload and analyze sustainability documents
- Project Management: Organize research by projects
- Chat Interface: Interactive AI assistant for research queries
- Background Processing: Asynchronous document processing with Inngest
- Vector Search: Semantic search using OpenAI embeddings and Supabase pgvector

## Tech Stack

- Frontend: Next.js 15, React 19, TailwindCSS
- Backend: Next.js API Routes
- Database: Supabase (PostgreSQL)
- Storage: Supabase Storage
- AI: OpenAI GPT models and embeddings
- Background Jobs: Inngest
- Web Search: Tavily API
- UI Components: Radix UI, shadcn/ui

## Development Commands

```bash
npm run dev        # Start development server with Turbopack
npm run build      # Build for production
npm run start      # Start production server
npm run lint       # Run ESLint
```

## Notes

- The Inngest dev server is optional for local development. Background jobs will be queued but won't process without it.
- Make sure Supabase is running before starting the Next.js server to avoid connection errors.
- For production deployment, you'll need production Supabase and Inngest credentials.
