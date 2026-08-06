import { Suspense } from "react";
import type { Metadata } from "next";
import { getServerSession } from "@/app/lib/session.server";
import { fetchAllRooms } from "@/app/lib/data.server";
import { Skeleton } from "@/app/components/ui/loading";
import { RoomsToolbar } from "./RoomsToolbar";
import { RoomsListClient } from "./RoomsListClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Rooms",
  description: "Browse and onboard rooms for the active property.",
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
          <h1>Rooms</h1>
          <p className="pcms-page-description">
            {rooms.length} room{rooms.length === 1 ? "" : "s"} in scope
          </p>
        </div>
        <RoomsToolbar />
      </header>

      <Suspense
        fallback={
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-24 rounded-xl" />
            ))}
          </div>
        }
      >
        <RoomsListClient rooms={rooms} />
      </Suspense>
    </div>
  );
}
