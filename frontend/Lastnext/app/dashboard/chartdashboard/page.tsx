// ./app/dashboard/chartdashboard/page.tsx
import { Suspense } from 'react';
import { fetchJobs } from '@/app/lib/data.server';
import PropertyJobsDashboard from '@/app/components/jobs/PropertyJobsDashboard';
import { getServerSession } from '@/app/lib/session.server';
import ErrorBoundary from '@/app/components/ErrorBoundary';

// Force dynamic rendering to avoid static generation issues with cookies
export const dynamic = 'force-dynamic';

export default async function ChartDashboardPage() {
  try {
    const session = await getServerSession();
    console.log('Chart Dashboard - Session status:', session ? 'authenticated' : 'unauthenticated');
    console.log('Chart Dashboard - User:', session?.user?.username || 'no user');
    
    const accessToken = session?.user?.accessToken;
    if (!accessToken) {
      console.warn('Chart Dashboard - No access token available');
    }

    const jobs = await fetchJobs(accessToken);
    console.log(`Chart Dashboard - Fetched ${jobs?.length || 0} jobs from API`);

    return (
      <div className="space-y-4">
        <ErrorBoundary>
          <Suspense fallback={<div>Loading...</div>}>
            <PropertyJobsDashboard initialJobs={jobs || []} />
          </Suspense>
        </ErrorBoundary>
      </div>
    );
  } catch (error) {
    console.error('Error loading chart dashboard:', error);
    
    // Fallback UI when data can't be loaded
    return (
      <div className="space-y-4">
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-md">
          <h3 className="text-lg font-medium text-yellow-800">Dashboard Unavailable</h3>
          <p className="text-yellow-700">
            Unable to load dashboard data. Please try refreshing the page or check your connection.
          </p>
          <details className="mt-2">
            <summary className="text-sm text-yellow-600 cursor-pointer">Error details</summary>
            <pre className="mt-2 text-xs text-yellow-800 overflow-x-auto">
              {error instanceof Error ? error.message : String(error)}
            </pre>
          </details>
        </div>
        <ErrorBoundary>
          <Suspense fallback={<div>Loading...</div>}>
            <PropertyJobsDashboard initialJobs={[]} />
          </Suspense>
        </ErrorBoundary>
      </div>
    );
  }
}

