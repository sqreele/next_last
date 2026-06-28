import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Building2, ArrowRight } from 'lucide-react';
import { getServerSession } from '@/app/lib/session.server';
import { fetchAllRooms } from '@/app/lib/data.server';
import { Skeleton } from '@/app/components/ui/loading';
import { RoomsToolbar } from './RoomsToolbar';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Rooms',
  description: 'Browse and onboard rooms for the active property.',
};

export default async function RoomsIndexPage() {
  const session = await getServerSession();
  const accessToken = session?.user?.accessToken;
  const rooms = (await fetchAllRooms(accessToken).catch(() => [])) || [];

  return (
    <div className="w-full max-w-none space-y-5 px-3 py-3 sm:px-4 md:px-5 lg:mx-auto lg:max-w-7xl">
      <header className="pcms-page-header">
        <div>
          <p className="pcms-eyebrow">Rooms workspace</p>
          <h1>
            Rooms
          </h1>
          <p className="pcms-page-description">
            {rooms.length} room{rooms.length === 1 ? '' : 's'} in scope
          </p>
        </div>
        <RoomsToolbar />
      </header>

      <Suspense
        fallback={
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-24 rounded-2xl" />
            ))}
          </div>
        }
      >
        {rooms.length === 0 ? (
          <div className="rounded-[18px] border border-dashed border-[var(--pcms-border-strong)] bg-[var(--pcms-surface-soft)] p-8 text-center">
            <Building2 className="mx-auto h-8 w-8 text-slate-400" />
            <p className="mt-3 text-sm font-bold text-slate-900">No rooms yet.</p>
            <p className="text-xs font-medium text-slate-500">
              Use Import CSV to onboard a floor plan in one shot.
            </p>
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {rooms.map((room: any) => (
              <li key={room.room_id}>
                <Link
                  href={`/dashboard/rooms/${room.room_id}`}
                  className="flex w-full items-center justify-between gap-3 rounded-[18px] border border-[var(--pcms-border)] bg-white p-4 shadow-[var(--pcms-shadow-sm)] transition-all hover:border-[var(--pcms-border-strong)] hover:shadow-[var(--pcms-shadow)]"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900">
                      {room.name || `Room ${room.room_id}`}
                    </p>
                    <p className="text-xs font-medium text-slate-500">
                      {room.room_type || 'Standard'}
                      {room.is_active === false && ' · inactive'}
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 flex-none text-slate-400" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Suspense>
    </div>
  );
}
