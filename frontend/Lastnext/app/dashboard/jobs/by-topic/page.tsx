// @ts-nocheck
// app/dashboard/jobs/by-topic/page.tsx
import React, { Suspense } from 'react';
import { getServerSession } from '@/app/lib/session.server';
import { fetchAllJobsForDashboard, fetchAllTopics } from '@/app/lib/data.server';
import { jobsApi } from '@/app/lib/api/jobsApi';
import JobsByTopicClient from './topic-client';

export const dynamic = 'force-dynamic';

export default async function JobsByTopicPage() {
  const session = await getServerSession();
  const accessToken = session?.user?.accessToken;

  const [jobs, topics, properties] = await Promise.all([
    fetchAllJobsForDashboard(accessToken),
    fetchAllTopics(accessToken),
    accessToken ? jobsApi.getProperties(accessToken) : Promise.resolve([]),
  ]);

  return (
    <div className="w-full">
      <Suspense fallback={<div className="text-sm text-gray-500">Loading...</div>}>
        <JobsByTopicClient initialJobs={jobs || []} topics={topics || []} properties={properties || []} />
      </Suspense>
    </div>
  );
}

