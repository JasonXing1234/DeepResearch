import { Toaster } from '@/components/ui/sonner';
import { SustainabilityDashboard } from '@/components/SustainabilityDashboard';

export const metadata = {
  title: 'Sustainability Data Processor',
  description: 'Process and analyze sustainability reports',
};

export default function SustainabilityPage() {
  return (
    <>
      <SustainabilityDashboard />
      <Toaster />
    </>
  );
}
