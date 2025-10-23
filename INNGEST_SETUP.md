# Inngest Setup for DeepResearch

This guide will help you set up a new Inngest app for the DeepResearch project.

## Local Development (Current Setup)

For local development, you don't need an Inngest account. Just run the Inngest Dev Server:

### Step 1: Start Your Next.js Dev Server

```bash
npm run dev
```

Your app should be running on `http://localhost:3000`

### Step 2: Start Inngest Dev Server

In a **separate terminal**, run:

```bash
npx inngest-cli@latest dev
```

When prompted for the app URL, enter:

```
http://localhost:3000/api/inngest
```

The Inngest Dev Server will:
- Discover your 6 registered functions
- Provide a dashboard at `http://localhost:8288`
- Allow you to test and debug functions locally

### Step 3: Access Inngest Dashboard

Open http://localhost:8288 in your browser to:
- View all functions
- Monitor job execution
- Trigger test events
- Debug errors

## Current Functions

The app has 6 Inngest functions registered:

1. **process-audio** - Transcribes audio files using OpenAI Whisper
2. **process-transcript** - Chunks and vectorizes transcripts
3. **process-pdf** - (Placeholder) Extracts text from PDFs
4. Plus 3 other functions from your previous app

## Production Setup (When Ready to Deploy)

### Step 1: Create Inngest Account

1. Go to https://www.inngest.com
2. Sign up for a free account
3. Create a new app called "DeepResearch"

### Step 2: Get Your Keys

From the Inngest dashboard:
1. Go to your app settings
2. Copy your **Event Key** (starts with `evt_`)
3. Copy your **Signing Key** (starts with `sgk_`)

### Step 3: Update Environment Variables

Add to your `.env.local` (for local testing with cloud):

```bash
# Inngest (Production)
INNGEST_EVENT_KEY=evt_your_event_key_here
INNGEST_SIGNING_KEY=sgk_your_signing_key_here
```

Add to Vercel environment variables (for production deployment):

```bash
INNGEST_EVENT_KEY=evt_your_event_key_here
INNGEST_SIGNING_KEY=sgk_your_signing_key_here
```

### Step 4: Deploy to Vercel

When you deploy to Vercel:
1. Inngest will automatically discover your app at `https://your-app.vercel.app/api/inngest`
2. All 6 functions will be registered
3. Events will be processed in the cloud

## Testing Your Setup

### Test Audio Processing

```bash
curl -X POST http://localhost:3000/api/upload-audio \
  -F "audio=@test.mp3" \
  -F "classId=YOUR_CLASS_UUID" \
  -F "title=Test Lecture"
```

Then check the Inngest dashboard at http://localhost:8288 to see:
- The `audio/uploaded` event
- The `process-audio` function running
- The transcript being generated

## Troubleshooting

### Inngest Dev Server Can't Find App

**Error**: "The Inngest Dev Server can't find your application"

**Solution**:
- Make sure Next.js is running on port 3000
- Use the full URL: `http://localhost:3000/api/inngest`
- Check that the endpoint responds: `curl http://localhost:3000/api/inngest`

### Functions Not Appearing

**Solution**:
- Restart the Inngest Dev Server
- Check the `/api/inngest` endpoint is accessible
- Verify all function files are in `src/inngest/functions/`

### Events Not Triggering

**Solution**:
- Check the Inngest dashboard for errors
- Verify event names match (e.g., `audio/uploaded`)
- Look at the Next.js console for errors

## App Configuration

Current configuration in `src/inngest/client.ts`:

```typescript
export const inngest = new Inngest({
  id: "deep-research",           // App ID (changed from "study-assistant")
  name: "DeepResearch AI",        // Display name
  eventKey: process.env.INNGEST_EVENT_KEY,
});
```

## Next Steps

1. ✅ Updated Inngest app ID to "deep-research"
2. 🔄 Restart your Next.js dev server: `npm run dev`
3. 🔄 Start Inngest Dev Server: `npx inngest-cli@latest dev`
4. 🔄 Enter URL when prompted: `http://localhost:3000/api/inngest`
5. 🎉 Open dashboard: http://localhost:8288

For production deployment, follow the "Production Setup" section above.
