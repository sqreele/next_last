// /app/dashboard/create-job/page.tsx
import { Suspense } from 'react';
import { Metadata } from 'next';
import CreateJobForm from '@/app/components/jobs/CreateJobForm';
import { redirect } from 'next/navigation';
import { getServerSession } from '@/app/lib/session.server';
import { PageContainer } from '@/app/components/layout/PageContainer';
import { PageHeader } from '@/app/components/layout/PageHeader';
import { Skeleton } from '@/app/components/ui/loading';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'สร้างงานซ่อม - HotelCare Pro',
  description: 'สร้างงานซ่อมบำรุงโรงแรม มอบหมายงาน ตั้งค่าความสำคัญ และอัปโหลดรูปภาพได้ในฟอร์มเดียว',
  keywords: ['HotelCare Pro', 'สร้างงานซ่อม', 'งานซ่อมโรงแรม', 'จัดการงานซ่อม', 'บำรุงรักษาโรงแรม'],
  openGraph: {
    title: 'สร้างงานซ่อม - HotelCare Pro',
    description: 'เพิ่มงานซ่อมบำรุงโรงแรมได้ง่ายด้วย HotelCare Pro',
    url: 'https://hotelcarepro.com/dashboard/create-job',
    type: 'website',
    images: [
      {
        url: 'https://hotelcarepro.com/og-create-job.jpg',
        width: 1200,
        height: 630,
        alt: 'HotelCare Pro - หน้าสร้างงานซ่อม',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'สร้างงานซ่อม - HotelCare Pro',
    description: 'สร้างงานซ่อมบำรุงโรงแรมได้ง่ายด้วย HotelCare Pro',
    images: ['https://hotelcarepro.com/twitter-create-job.jpg'],
  },
};

export default async function CreateJobPage() {
  const session = await getServerSession();

  if (!session) {
    redirect('/auth/login');
  }

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Work orders"
        title="Create a maintenance job"
        description="Capture the issue, location, priority, assignee, and supporting photos."
      />
      <Suspense fallback={
        <div className="space-y-4 rounded-xl border border-border bg-card p-5" aria-label="Loading job form">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      }>
        <CreateJobForm />
      </Suspense>
    </PageContainer>
  );
}
