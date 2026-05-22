'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/app/lib/stores/mainStore';
import { RoomCsvImport } from '@/app/components/rooms/RoomCsvImport';

export function RoomsToolbar() {
  const router = useRouter();
  const { selectedPropertyId } = useUser();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <RoomCsvImport
        currentPropertyId={selectedPropertyId}
        onImported={() => router.refresh()}
      />
    </div>
  );
}
