// /app/dashboard/create-job/page.tsx
import { Suspense } from 'react';
import { Metadata } from 'next';
import CreateJobForm from '@/app/components/jobs/CreateJobForm';
import { redirect } from 'next/navigation';
import { getServerSession } from '@/app/lib/session.server';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Create Job - HotelEngPro',
  description: 'Create a new hotel maintenance job effortlessly with HotelEngPro. Assign tasks, set priorities, and upload images with our intuitive form.',
  keywords: ['HotelEngPro', 'create job', 'hotel maintenance', 'job management', 'property maintenance', 'hotel engineering'],
  openGraph: {
    title: 'Create Job - HotelEngPro',
    description: 'Add new hotel maintenance tasks with ease using HotelEngPro.',
    url: 'https://pcms.live/dashboard/create-job',
    type: 'website',
    images: [
      {
        url: 'https://pcms.live/og-create-job.jpg',
        width: 1200,
        height: 630,
        alt: 'HotelEngPro - Create Job Page',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Create Job - HotelEngPro',
    description: 'Effortlessly create hotel maintenance jobs with HotelEngPro.',
    images: ['https://pcms.live/twitter-create-job.jpg'],
  },
};

export default async function CreateJobPage() {
  const session = await getServerSession();

  if (!session) {
    redirect('/auth/login');
  }

  return (
    <div className="w-full bg-[#F3F5FA] px-3 pb-6 pt-2 sm:px-4 md:px-6 xl:px-8">
      <Suspense fallback={
        <div className="mx-auto flex min-h-[60vh] w-full max-w-7xl items-center justify-center rounded-lg border border-slate-200 bg-white py-12 shadow-sm">
          <div className="flex flex-col items-center gap-4">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-[var(--pcms-primary)]"></div>
            <p className="text-sm text-[var(--pcms-text-muted)]">Loading...</p>
          </div>
        </div>
      }>
        <CreateJobForm />
      </Suspense>
    </div>
  );
}
