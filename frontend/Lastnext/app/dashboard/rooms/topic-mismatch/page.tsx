// @ts-nocheck
import React, { Suspense } from 'react';
import { Metadata } from 'next';
import { getServerSession } from '@/app/lib/session.server';
import { fetchAllRooms, fetchAllTopics, fetchAllJobsForDashboard } from '@/app/lib/data.server';
import TopicMismatchClient from './topic-mismatch-client';
import { generatePageMetadata } from '@/app/lib/seo-config';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = generatePageMetadata('roomsByTopic');

export default async function RoomsTopicMismatchPage() {
  const session = await getServerSession();
  const accessToken = session?.user?.accessToken;

  const [rooms, topics, jobs] = await Promise.all([
    fetchAllRooms(accessToken),
    fetchAllTopics(accessToken),
    fetchAllJobsForDashboard(accessToken),
  ]);

  return (
    <div className="w-full">
      <Suspense fallback={<div className="text-sm text-gray-500">Loading...</div>}>
        <TopicMismatchClient rooms={rooms || []} topics={topics || []} jobs={jobs || []} />
      </Suspense>
    </div>
  );
}
