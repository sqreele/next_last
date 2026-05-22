import type { Metadata } from 'next';
import { GuestReportForm } from './GuestReportForm';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Report an issue',
  description: 'Send a maintenance request directly to the hotel team.',
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ propertyId: string; roomId: string }>;
}

export default async function GuestReportPage({ params }: PageProps) {
  const { propertyId, roomId } = await params;
  return (
    <main className="min-h-[100dvh] bg-gradient-to-b from-slate-50 to-cyan-50 px-4 py-8">
      <GuestReportForm propertyId={propertyId} roomId={roomId} />
    </main>
  );
}
