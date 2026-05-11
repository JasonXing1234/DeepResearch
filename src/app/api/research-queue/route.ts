import { NextResponse } from 'next/server';

const BACKEND_DISABLED_MESSAGE =
  'Backend logic is disabled on this branch. Frontend-only mode is active.';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    success: true,
    backendDisabled: true,
    message: BACKEND_DISABLED_MESSAGE,
    data: [],
  });
}
