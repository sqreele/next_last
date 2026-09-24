"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { Room } from "@/app/lib/types";
import { useProperties, useUser } from "@/app/lib/stores/mainStore";
import { filterRoomsByProperty } from "@/app/lib/utils/property-filter";
import { FeedbackState } from "@/app/components/feedback/FeedbackState";

export function RoomsListClient({ rooms }: { rooms: Room[] }) {
  const { selectedPropertyId } = useUser();
  const { properties } = useProperties();
  const scopedRooms = filterRoomsByProperty(
    rooms,
    selectedPropertyId,
    properties,
  );

  if (scopedRooms.length === 0) {
    return (
      <FeedbackState
        title="No rooms yet"
        description="Use Import CSV to onboard a floor plan in one shot."
      />
    );
  }

  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {scopedRooms.map((room) => (
        <li key={room.room_id}>
          <Link
            href={`/dashboard/rooms/${room.room_id}`}
            className="flex w-full items-center justify-between gap-3 rounded-xl border border-[var(--pcms-border)] bg-card p-4 shadow-[var(--pcms-shadow-soft)] transition-all hover:border-[var(--pcms-border-strong)] hover:shadow-[var(--pcms-shadow)]"
          >
            <div className="min-w-0">
              <p className="text-sm font-bold text-foreground">
                {room.name || `Room ${room.room_id}`}
              </p>
              <p className="text-xs font-medium text-muted-foreground">
                {room.room_type || "Standard"}
                {room.is_active === false && " · inactive"}
              </p>
            </div>
            <ArrowRight className="h-4 w-4 flex-none text-muted-foreground" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
