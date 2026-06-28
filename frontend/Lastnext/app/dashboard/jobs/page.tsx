import { Suspense } from 'react';
import type { Metadata } from 'next';
import { fetchAllJobsForDashboard, fetchProperties } from '@/app/lib/data.server';
import { getServerSession } from '@/app/lib/session.server';
import { JobListSkeleton, Skeleton } from '@/app/components/ui/loading';
import { JobsListWithStatus } from './JobsListWithStatus';
import type { TabValue } from '@/app/lib/types';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Jobs',
  description: 'Filterable list of maintenance jobs across the active property.',
};

const VALID_STATUSES: TabValue[] = [
  'all',
  'pending',
  'in_progress',
  'waiting_sparepart',
  'completed',
  'cancelled',
  'defect',
  'preventive_maintenance',
];

interface PageProps {
  searchParams: Promise<{ status?: string }>;
}

export default async function JobsIndexPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const requestedStatus = (sp?.status || 'all') as TabValue;
  const initialFilter: TabValue = VALID_STATUSES.includes(requestedStatus) ? requestedStatus : 'all';

  const session = await getServerSession();
  const accessToken = session?.user?.accessToken;
  const [jobs, properties] = await Promise.all([
    fetchAllJobsForDashboard(accessToken).catch(() => []),
    fetchProperties(accessToken).catch(() => []),
  ]);

  return (
    <div className="w-full max-w-none space-y-5 px-3 py-3 sm:px-4 md:px-5 lg:mx-auto lg:max-w-7xl">
      <header className="pcms-page-header">
        <div>
          <p className="pcms-eyebrow">Jobs workspace</p>
          <h1>
            Maintenance jobs
          </h1>
          <p className="pcms-page-description">
            {jobs.length} job{jobs.length === 1 ? '' : 's'} in scope · filter via the toolbar below
          </p>
        </div>
      </header>
      <Suspense
        fallback={
          <div className="space-y-3">
            <Skeleton className="h-12 w-full rounded-xl" />
            <JobListSkeleton count={6} />
          </div>
        }
      >
        <JobsListWithStatus jobs={jobs} properties={properties} initialFilter={initialFilter} />
      </Suspense>
    </div>
  );
}
