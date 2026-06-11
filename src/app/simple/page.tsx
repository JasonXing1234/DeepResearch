import { SimpleResearchView } from '@/components/SimpleResearchView';
import { Toaster } from '@/components/ui/sonner';

export const metadata = {
  title: 'Company Research',
  description: 'Upload a company list, run research, and download results.',
};

export default function SimplePage() {
  return (
    <>
      <SimpleResearchView />
      <Toaster />
    </>
  );
}
