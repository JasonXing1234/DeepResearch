import { jsonDisabled } from '@/lib/backend-disabled';

export async function GET() {
  return jsonDisabled({ results: [] });
}
