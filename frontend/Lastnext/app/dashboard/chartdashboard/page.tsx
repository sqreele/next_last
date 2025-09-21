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
      <div className="min-h-screen bg-white">
        {/* Instagram-style header */}
        <div className="sticky top-0 z-50 bg-white border-b border-gray-200">
          <div className="max-w-4xl mx-auto px-4 py-3">
            <div className="flex items-center justify-between">
              <h1 className="text-xl font-semibold text-gray-900">Analytics</h1>
            </div>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 py-6">
          <ErrorBoundary>
            <Suspense fallback={
              <div className="flex items-center justify-center min-h-[400px]">
                <div className="text-center">
                  <div className="w-8 h-8 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin mx-auto mb-4"></div>
                  <p className="text-sm text-gray-500">Loading...</p>
                </div>
              </div>
            }>
              <PropertyJobsDashboard initialJobs={jobs || []} />
            </Suspense>
          </ErrorBoundary>
        </div>
      </div>
    );
  } catch (error) {
    
    // Fallback UI when data can't be loaded
    return (
      <div className="min-h-screen bg-white">
        {/* Instagram-style header */}
        <div className="sticky top-0 z-50 bg-white border-b border-gray-200">
          <div className="max-w-4xl mx-auto px-4 py-3">
            <div className="flex items-center justify-between">
              <h1 className="text-xl font-semibold text-gray-900">Analytics</h1>
            </div>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="p-4 sm:p-6 bg-yellow-50 border border-yellow-200 rounded-lg mb-6">
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
                  <div className="w-8 h-8 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin mx-auto mb-4"></div>
                  <p className="text-sm text-gray-500">Loading...</p>
                </div>
              </div>
            }>
              <PropertyJobsDashboard initialJobs={[]} />
            </Suspense>
          </ErrorBoundary>
        </div>
      </div>
    );
  }
}

