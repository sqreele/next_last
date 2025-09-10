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
    const accessToken = session?.user?.accessToken;

    const jobs = await fetchJobs(accessToken);

    return (
      <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        <ErrorBoundary>
          <Suspense fallback={
            <div className="flex items-center justify-center min-h-[400px]">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-gray-600">Loading dashboard...</p>
              </div>
            </div>
          }>
            <PropertyJobsDashboard initialJobs={jobs || []} />
          </Suspense>
        </ErrorBoundary>
      </div>
    );
  } catch (error) {
    
    // Fallback UI when data can't be loaded
    return (
      <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        <div className="p-4 sm:p-6 bg-yellow-50 border border-yellow-200 rounded-lg">
          <h3 className="text-lg sm:text-xl font-medium text-yellow-800 mb-2">Dashboard Unavailable</h3>
          <p className="text-sm sm:text-base text-yellow-700 mb-4">
            Unable to load dashboard data. Please try refreshing the page or check your connection.
          </p>
          <details className="mt-2">
            <summary className="text-sm text-yellow-600 cursor-pointer hover:text-yellow-800">Error details</summary>
            <pre className="mt-2 text-xs text-yellow-800 overflow-x-auto bg-yellow-100 p-2 rounded">
              {error instanceof Error ? error.message : String(error)}
            </pre>
          </details>
        </div>
        <ErrorBoundary>
          <Suspense fallback={
            <div className="flex items-center justify-center min-h-[400px]">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-gray-600">Loading dashboard...</p>
              </div>
            </div>
          }>
            <PropertyJobsDashboard initialJobs={[]} />
          </Suspense>
        </ErrorBoundary>
      </div>
    );
  }
}

