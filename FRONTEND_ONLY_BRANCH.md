# Frontend-Only Branch

This branch has all backend logic disabled to unblock development in SageMaker and avoid OpenTelemetry permission errors.

## What's Disabled

- **Inngest** (background job queue) — removed from `package.json`
- **AWS SQS** (message queue client) — removed from `package.json`  
- **Supabase middleware** — simplified to no-op pass-through
- **Database calls** — all API routes now return mock responses
- **WebSearch & embeddings** — not called from API layer
- **OpenAI integrations** — not called from API layer
- **File uploads/storage** — mock responses only

## What Still Works

- **Frontend components** — all UI code is untouched
- **React hooks & state** — fully functional
- **UI framework** — Next.js, Tailwind, Radix UI
- **Client-side routing** — normal Next.js app behavior

## API Routes (All Frontend-Only Stubs)

All routes in `src/app/api/**` respond with mock data and `backendDisabled: true`:

- `/api/research-companies` — skips research, returns success
- `/api/research-chat`, `/api/research-chat-all` — echo prompts
- `/api/research-queue` — returns empty history
- `/api/sustainability/projects` — returns empty projects or creates mock ones
- `/api/sustainability/upload` — skips upload, returns mock file
- `/api/sustainability/analyze` — skips analysis, returns success
- `/api/sustainability/results` — returns empty results
- `/api/sustainability/chat` — responds with disabled message
- `/api/sustainability/export-excel` — returns empty Excel file
- `/api/sustainability/download-file` — returns empty JSON

## How to Rebuild Backend

1. Restore `Inngest` or replace with lightweight job queue (e.g., Bull, standard cron)
2. Add Supabase middleware back to `middleware.ts`:
   ```typescript
   import { updateSession } from '@/lib/supabase/middleware'
   export async function middleware(request: NextRequest) {
     return await updateSession(request)
   }
   ```
3. Replace stub API routes with real implementations
4. Re-add dependencies to `package.json`
5. Remove `/src/lib/backend-disabled.ts` helper once not needed

## Environment Variables

The following remain in `.env.local` and `.env.production`:

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
OPENAI_API_KEY
SUPABASE_SERVICE_ROLE_KEY
TAVILY_API_KEY (or other search provider)
AWS_* (if using AWS services)
```

Set to valid values only when rebuilding backend services.

## No OpenTelemetry Issues

This branch runs without OpenTelemetry, AWS credential auto-discovery, or SageMaker permission errors. Ready for clean frontend development.
