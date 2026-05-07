import { NextRequest } from 'next/server';
import { emptyDownloadResponse } from '@/lib/backend-disabled';

export async function GET(req: NextRequest) {
  const fileType = req.nextUrl.searchParams.get('fileType') || 'placeholder';
  return emptyDownloadResponse(`${fileType}.json`, '[]');
}
