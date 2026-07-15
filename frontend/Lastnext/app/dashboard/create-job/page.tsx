// /app/dashboard/create-job/page.tsx
import { Suspense } from 'react';
import { Metadata } from 'next';
import CreateJobForm from '@/app/components/jobs/CreateJobForm';
import { redirect } from 'next/navigation';
import { getServerSession } from '@/app/lib/session.server';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'สร้างงานซ่อม - HotelEngPro',
  description: 'สร้างงานซ่อมบำรุงโรงแรม มอบหมายงาน ตั้งค่าความสำคัญ และอัปโหลดรูปภาพได้ในฟอร์มเดียว',
  keywords: ['HotelEngPro', 'สร้างงานซ่อม', 'งานซ่อมโรงแรม', 'จัดการงานซ่อม', 'บำรุงรักษาโรงแรม'],
  openGraph: {
    title: 'สร้างงานซ่อม - HotelEngPro',
    description: 'เพิ่มงานซ่อมบำรุงโรงแรมได้ง่ายด้วย HotelEngPro',
    url: 'https://pcms.live/dashboard/create-job',
    type: 'website',
    images: [
      {
        url: 'https://pcms.live/og-create-job.jpg',
        width: 1200,
        height: 630,
        alt: 'HotelEngPro - หน้าสร้างงานซ่อม',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'สร้างงานซ่อม - HotelEngPro',
    description: 'สร้างงานซ่อมบำรุงโรงแรมได้ง่ายด้วย HotelEngPro',
    images: ['https://pcms.live/twitter-create-job.jpg'],
  },
};

export default async function CreateJobPage() {
  const session = await getServerSession();

  if (!session) {
    redirect('/auth/login');
  }

  return (
    <div className="w-full bg-[#f7f8f8] px-3 pb-6 pt-2 sm:px-4 md:px-6 xl:px-8">
      <Suspense fallback={
        <div className="mx-auto flex min-h-[60vh] w-full max-w-7xl items-center justify-center rounded-lg border border-slate-200 bg-white py-12 shadow-sm">
          <div className="flex flex-col items-center gap-4">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#e2e6e8] border-t-[#46b8bc]"></div>
            <p className="text-sm text-[var(--pcms-text-muted)]">กำลังโหลด...</p>
          </div>
        </div>
      }>
        <CreateJobForm />
      </Suspense>
    </div>
  );
}
