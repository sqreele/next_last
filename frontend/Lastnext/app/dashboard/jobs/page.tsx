import type { Metadata } from 'next';
import { JobsListWithStatus } from './JobsListWithStatus';
import type { TabValue } from '@/app/lib/types';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Jobs',
  description: 'Filterable maintenance jobs for the active property.',
};

const VALID_STATUSES: TabValue[] = [
  'all', 'pending', 'in_progress', 'waiting_sparepart', 'completed',
  'cancelled', 'defect', 'preventive_maintenance',
];

interface PageProps {
  searchParams: Promise<{ status?: string }>;
}

export default async function JobsIndexPage({ searchParams }: PageProps) {
  const requestedStatus = ((await searchParams)?.status || 'all') as TabValue;
  const initialFilter = VALID_STATUSES.includes(requestedStatus) ? requestedStatus : 'all';
  return <JobsListWithStatus initialFilter={initialFilter} />;
}
