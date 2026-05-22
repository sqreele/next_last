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
    <div className="mx-auto w-full max-w-7xl space-y-5 px-3 py-5 sm:px-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">PCMS</p>
          <h1 className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
            Rooms
          </h1>
          <p className="text-sm font-medium text-slate-600">
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
          <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-8 text-center">
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
                  className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:border-slate-300 hover:shadow-md"
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
