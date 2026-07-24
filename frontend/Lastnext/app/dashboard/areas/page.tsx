// /app/dashboard/areas/page.tsx
import { Suspense } from 'react';
import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getServerSession } from '@/app/lib/session.server';
import AreasClient from './AreasClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Areas - HotelCare Pro',
  description: 'Manage property areas and zones used for maintenance jobs.',
};

export default async function AreasPage() {
  const session = await getServerSession();
  if (!session) {
    redirect('/auth/login');
  }
  return (
    <div className="w-full px-3 pb-4 pt-2 sm:px-4 md:px-5">
      <Suspense fallback={<div className="pcms-section-card p-6 text-sm text-[var(--pcms-text-muted)]">Loading...</div>}>
        <AreasClient />
      </Suspense>
    </div>
  );
}
