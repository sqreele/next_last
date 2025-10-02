// @ts-nocheck
// app/dashboard/rooms/by-topics/page.tsx
import React, { Suspense } from 'react';
import { getServerSession } from '@/app/lib/session.server';
import { fetchAllRooms, fetchAllTopics } from '@/app/lib/data.server';
import { jobsApi } from '@/app/lib/api/jobsApi';
import RoomsByTopicClient from './room-topic-client';

export const dynamic = 'force-dynamic';

export default async function RoomsByTopicPage() {
  const session = await getServerSession();
  const accessToken = session?.user?.accessToken;

  const [rooms, topics, properties] = await Promise.all([
    fetchAllRooms(accessToken),
    fetchAllTopics(accessToken),
    accessToken ? jobsApi.getProperties(accessToken) : Promise.resolve([]),
  ]);

  return (
    <div className="w-full">
      <Suspense fallback={<div className="text-sm text-gray-500">Loading...</div>}>
        <RoomsByTopicClient rooms={rooms || []} topics={topics || []} properties={properties || []} />
      </Suspense>
    </div>
  );
}

