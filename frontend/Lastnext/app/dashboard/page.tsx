// ./app/dashboard/page.tsx
import { Suspense } from 'react';
import { Metadata } from 'next';
import DashboardWithAuth from '@/app/dashboard/DashboardWithAuth';
import { generatePageMetadata } from '@/app/lib/seo-config';

export const dynamic = 'force-dynamic'; // Ensure dynamic rendering

// SEO Metadata for Dashboard
export const metadata: Metadata = generatePageMetadata('dashboard');

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Instagram-style layout */}
      <div className="max-w-4xl mx-auto">
        <Suspense
          fallback={
            <div className="flex items-center justify-center min-h-screen">
              <div className="text-center space-y-4">
                {/* Instagram-style loading spinner */}
                <div className="w-8 h-8 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin mx-auto"></div>
                <p className="text-sm text-gray-500">Loading...</p>
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
