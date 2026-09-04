// app/dashboard/rooms/[room_id]/page.tsx
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { fetchRoom, fetchProperties, fetchJobsForRoom } from '@/app/lib/data.server';
import RoomDetailContent from './RoomDetailContent';

type Props = {
  params: Promise<{ room_id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

// Server Component
export default async function RoomDetailPage({ params }: Props) {
  const { room_id } = await params;
  const room = await fetchRoom(room_id);
  if (!room) {
    notFound();
  }

  const properties = await fetchProperties();
  const jobs = await fetchJobsForRoom(room_id);

  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <RoomDetailContent room={room} properties={properties} jobs={jobs} />
    </Suspense>
  );
}

// Loading Skeleton
function LoadingSkeleton() {
  return (
    <div className="w-full max-w-none px-3 py-4 sm:px-6 sm:py-6 lg:mx-auto lg:max-w-7xl desktop:max-w-[96rem]">
      <div className="animate-pulse">
        <div className="h-8 w-1/3 bg-gray-200 rounded-sm mb-4"></div>
        <div className="h-4 w-1/4 bg-gray-200 rounded-sm mb-4"></div>
        <div className="space-y-2">
          <div className="h-4 w-full bg-gray-200 rounded-sm"></div>
          <div className="h-4 w-3/4 bg-gray-200 rounded-sm"></div>
          <div className="h-4 w-1/2 bg-gray-200 rounded-sm"></div>
        </div>
      </div>
    </div>
  );
}
