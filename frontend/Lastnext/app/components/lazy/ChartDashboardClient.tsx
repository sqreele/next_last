'use client';

import dynamic from 'next/dynamic';
import { Job } from '@/app/lib/types';

// ✅ PERFORMANCE: Client-side wrapper for lazy-loaded dashboard
// This ensures the component only loads on the client side

const LazyPropertyJobsDashboard = dynamic(
  () => import('@/app/components/jobs/PropertyJobsDashboard'),
  {
    loading: () => (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-sm text-gray-500">Loading dashboard...</p>
        </div>
      </div>
    ),
    ssr: false, // Critical: prevent SSR to avoid "self is not defined" errors
  }
);

interface ChartDashboardClientProps {
  initialJobs: Job[];
}

export default function ChartDashboardClient({ initialJobs }: ChartDashboardClientProps) {
  return <LazyPropertyJobsDashboard initialJobs={initialJobs} />;
}

