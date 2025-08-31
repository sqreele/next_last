// ./app/dashboard/page.tsx
import { Suspense } from 'react';
import DashboardWithAuth from '@/app/dashboard/DashboardWithAuth';

export const dynamic = 'force-dynamic'; // Ensure dynamic rendering

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <Suspense
          fallback={
            <div className="flex items-center justify-center min-h-[400px]">
              <div className="text-center space-y-4">
                <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto"></div>
                <p className="text-lg font-medium text-gray-600">Loading dashboard...</p>
              </div>
            </div>
          }
        >
          <DashboardWithAuth />
        </Suspense>
      </div>
    </div>
  );
}
