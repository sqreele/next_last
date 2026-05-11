// /app/dashboard/areas/page.tsx
import { Suspense } from 'react';
import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getServerSession } from '@/app/lib/session.server';
import AreasClient from './AreasClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Areas - HotelEngPro',
  description: 'Manage property areas and zones used for maintenance jobs.',
};

export default async function AreasPage() {
  const session = await getServerSession();
  if (!session) {
    redirect('/auth/login');
  }
  return (
    <div className="min-h-screen bg-gray-50">
      <Suspense fallback={<div className="p-6 text-sm text-gray-500">Loading...</div>}>
        <AreasClient />
      </Suspense>
    </div>
  );
}
