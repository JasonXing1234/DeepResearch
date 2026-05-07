import { jsonDisabled, makeMockFile } from '@/lib/backend-disabled';

export async function POST() {
  return jsonDisabled({
    file: makeMockFile(),
    message: 'Upload skipped because backend logic is disabled on this branch.',
  });
}
