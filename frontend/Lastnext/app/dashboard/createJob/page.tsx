// /app/dashboard/createJob/page.tsx
import { Suspense } from 'react';
import { Metadata } from 'next';
import CreateJobForm from '@/app/components/jobs/CreateJobForm';
import { redirect } from 'next/navigation';
import { getServerSession } from '@/app/lib/session.server';
import { Plus } from 'lucide-react';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Create Job - Maintenance & Job Management Dashboard',
  description: 'Create a new maintenance job effortlessly. Assign tasks, set priorities, and upload images with our intuitive form.',
  keywords: ['create job', 'maintenance task', 'job management', 'property maintenance', 'dashboard'],
  openGraph: {
    title: 'Create Job - Maintenance & Job Management Dashboard',
    description: 'Add new maintenance tasks with ease using our Next.js-powered form.',
    url: 'https://pcms.live/dashboard/createJob',
    type: 'website',
    images: [
      {
        url: 'https://pcms.live/og-create-job.jpg',
        width: 1200,
        height: 630,
        alt: 'Create Job Page Preview',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Create Job - Maintenance & Job Management Dashboard',
    description: 'Effortlessly create maintenance jobs with our intuitive tool.',
    images: ['https://pcms.live/twitter-create-job.jpg'],
  },
};

export default async function CreateJobPage() {
  // Server-side session check
  const session = await getServerSession();
  console.log('Server session:', session); // Debug log

  if (!session) {
    redirect('/auth/login');
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Instagram-style header */}
      <div className="sticky top-0 z-50 bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-semibold text-gray-900">Create Job</h1>
            <div className="flex items-center gap-4">
              <button className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                <Plus className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto">
        {/* Form Section with Instagram-style clean design */}
        <div className="px-4 py-6">
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">New Maintenance Job</h2>
              <p className="text-sm text-gray-600 mt-1">
                Fill out the details below to create a new maintenance job.
              </p>
            </div>
            
            <div className="p-6">
              <Suspense fallback={
                <div className="flex items-center justify-center py-12">
                  <div className="flex flex-col items-center gap-4">
                    <div className="w-8 h-8 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin"></div>
                    <p className="text-sm text-gray-500">Loading...</p>
                  </div>
                </div>
              }>
                <CreateJobForm />
              </Suspense>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
