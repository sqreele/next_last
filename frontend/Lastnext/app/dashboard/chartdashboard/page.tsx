// ./app/dashboard/chartdashboard/page.tsx
import { Suspense } from 'react';
import { fetchJobs } from '@/app/lib/data.server';
import PropertyJobsDashboard from '@/app/components/jobs/PropertyJobsDashboard';
import { getServerSession } from '@/app/lib/next-auth-compat';
import ErrorBoundary from '@/app/components/ErrorBoundary';

export default async function ChartDashboardPage() {
  const session = await getServerSession();
  const accessToken = session?.user?.accessToken;

  const jobs = await fetchJobs(accessToken);

  return (
    <div className="space-y-4">
      <ErrorBoundary>
        <Suspense fallback={<div>Loading...</div>}>
          <PropertyJobsDashboard initialJobs={jobs || []} />
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}

