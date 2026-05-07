import { NextRequest } from 'next/server';
import { jsonDisabled } from '@/lib/backend-disabled';

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const companies = Array.isArray(body?.companies) ? body.companies : [];

  return jsonDisabled({
    uploadedFiles: 0,
    researchId: 'frontend-only-research',
    message:
      companies.length > 0
        ? `Backend disabled. Skipped research for ${companies.length} companies.`
        : undefined,
  });
}
