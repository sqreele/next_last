'use client';

import Link from 'next/link';
import { ArrowRight, Building2 } from 'lucide-react';
import type { Room } from '@/app/lib/types';
import { useProperties, useUser } from '@/app/lib/stores/mainStore';
import { filterRoomsByProperty } from '@/app/lib/utils/property-filter';

export function RoomsListClient({ rooms }: { rooms: Room[] }) {
  const { selectedPropertyId } = useUser();
  const { properties } = useProperties();
  const scopedRooms = filterRoomsByProperty(rooms, selectedPropertyId, properties);

  if (scopedRooms.length === 0) {
    return (
      <div className="rounded-[18px] border border-dashed border-[var(--pcms-border-strong)] bg-[var(--pcms-surface-soft)] p-8 text-center">
        <Building2 className="mx-auto h-8 w-8 text-slate-400" />
        <p className="mt-3 text-sm font-bold text-slate-900">No rooms yet.</p>
        <p className="text-xs font-medium text-slate-500">
          Use Import CSV to onboard a floor plan in one shot.
        </p>
      </div>
    );
  }

  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {scopedRooms.map((room) => (
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
  );
}
