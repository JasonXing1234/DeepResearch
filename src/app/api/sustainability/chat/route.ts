import { jsonDisabled } from '@/lib/backend-disabled';

export async function POST() {
  return jsonDisabled({
    response: 'Project assistant backend is disabled on this branch.',
  });
}
