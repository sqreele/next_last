// @ts-nocheck
// app/dashboard/rooms/by-topics/page.tsx
import React, { Suspense } from 'react';
import { Metadata } from 'next';
import { getServerSession } from '@/app/lib/session.server';
import { fetchAllRooms, fetchAllTopics, fetchAllJobsForDashboard } from '@/app/lib/data.server';
import { jobsApi } from '@/app/lib/api/jobsApi';
import RoomsByTopicClient from './room-topic-client';
import { generatePageMetadata } from '@/app/lib/seo-config';

export const dynamic = 'force-dynamic';

// SEO Metadata for Rooms by Topic
export const metadata: Metadata = generatePageMetadata('roomsByTopic');

export default async function RoomsByTopicPage() {
  const session = await getServerSession();
  const accessToken = session?.user?.accessToken;

  const [rooms, topics, properties, jobs] = await Promise.all([
    fetchAllRooms(accessToken),
    fetchAllTopics(accessToken),
    accessToken ? jobsApi.getProperties(accessToken) : Promise.resolve([]),
    fetchAllJobsForDashboard(accessToken),
  ]);

  return (
    <div className="w-full">
      <Suspense fallback={<div className="text-sm text-gray-500">Loading...</div>}>
        <RoomsByTopicClient rooms={rooms || []} topics={topics || []} properties={properties || []} jobs={jobs || []} />
      </Suspense>
    </div>
  );
}

