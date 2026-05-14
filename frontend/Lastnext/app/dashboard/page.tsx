// ./app/dashboard/page.tsx
import { Suspense } from 'react';
import { Metadata } from 'next';
import DashboardWithAuth from '@/app/dashboard/DashboardWithAuth';
import { PageLoader } from '@/app/components/ui/loading';
import { generatePageMetadata } from '@/app/lib/seo-config';

export const dynamic = 'force-dynamic'; // Ensure dynamic rendering

// SEO Metadata for Dashboard
export const metadata: Metadata = generatePageMetadata('dashboard');

export default function DashboardPage() {
  return (
    <div className="min-h-screen" style={{ background: 'var(--sneat-body-bg)' }}>
      <Suspense
        fallback={<PageLoader label="Loading dashboard" description="Preparing KPI cards and recent maintenance jobs." />}
      >
        <DashboardWithAuth />
      </Suspense>
    </div>
  );
}
