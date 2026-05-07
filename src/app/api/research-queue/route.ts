import { jsonDisabled } from '@/lib/backend-disabled';

export const maxDuration = 60;

export async function GET() {
  return jsonDisabled({ data: [] });
}
