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
    <div className="w-full max-w-none space-y-5 px-3 py-4 sm:px-6 sm:py-5 lg:mx-auto lg:max-w-7xl">
      <header className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">PCMS</p>
          <h1 className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
            Maintenance jobs
          </h1>
          <p className="text-sm font-medium text-slate-600">
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
