import { jsonDisabled } from '@/lib/backend-disabled';

export async function POST() {
  return jsonDisabled({
    message: 'Analysis skipped because backend logic is disabled on this branch.',
  });
}
