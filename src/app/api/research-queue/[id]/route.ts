import { jsonDisabled, makeMockResearchEntry } from '@/lib/backend-disabled';

export const maxDuration = 60;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  return jsonDisabled({
    data: {
      ...makeMockResearchEntry({ id }),
      documents: [],
    },
  });
}

export async function DELETE() {
  return jsonDisabled({ message: 'Research entry removed from frontend-only branch.' });
}
