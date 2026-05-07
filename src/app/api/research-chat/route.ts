import { NextRequest } from 'next/server';
import { jsonDisabled } from '@/lib/backend-disabled';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const message = typeof body?.message === 'string' ? body.message : '';

  return jsonDisabled({
    message: message
      ? `Backend chat is disabled on this branch. Prompt received: ${message}`
      : 'Backend chat is disabled on this branch.',
    sources: [],
  });
}
