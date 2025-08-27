// /app/dashboard/createJob/page.tsx
import { Suspense } from 'react';
import { Metadata } from 'next';
import CreateJobForm from '@/app/components/jobs/CreateJobForm';
import { redirect } from 'next/navigation';
import { getServerSession } from '@/app/lib/next-auth-compat.server';
import { Plus, Wrench, Building, Calendar, Users } from 'lucide-react';

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
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-indigo-50">
      {/* Hero Section */}
      <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="text-center">
            <div className="flex justify-center mb-6">
              <div className="p-4 bg-white/20 rounded-full backdrop-blur-sm">
                <Plus className="h-12 w-12 text-white" />
              </div>
            </div>
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
              Create New Maintenance Job
            </h1>
            <p className="text-xl text-blue-100 max-w-3xl mx-auto leading-relaxed">
              Streamline your maintenance workflow with our intuitive job creation tool. 
              Assign tasks, set priorities, and track progress efficiently.
            </p>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 border border-white/20 shadow-lg">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-blue-100 rounded-xl">
                <Wrench className="h-6 w-6 text-blue-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Task Management</h3>
            </div>
            <p className="text-gray-600 text-sm">
              Create detailed maintenance tasks with descriptions, priorities, and status tracking.
            </p>
          </div>

          <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 border border-white/20 shadow-lg">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-green-100 rounded-xl">
                <Building className="h-6 w-6 text-green-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Room Assignment</h3>
            </div>
            <p className="text-gray-600 text-sm">
              Assign jobs to specific rooms and locations for better organization and tracking.
            </p>
          </div>

          <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 border border-white/20 shadow-lg">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-purple-100 rounded-xl">
                <Calendar className="h-6 w-6 text-purple-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Priority System</h3>
            </div>
            <p className="text-gray-600 text-sm">
              Set job priorities and track completion status for efficient maintenance management.
            </p>
          </div>
        </div>

        {/* Form Section */}
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-3xl shadow-2xl border border-gray-100 overflow-hidden">
            <div className="bg-gradient-to-r from-gray-50 to-slate-50 px-8 py-6 border-b border-gray-200">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Job Details</h2>
              <p className="text-gray-600">
                Fill out the form below to create a new maintenance job. All required fields are marked with an asterisk (*).
              </p>
            </div>
            
            <div className="p-8">
              <Suspense fallback={
                <div className="flex items-center justify-center py-12">
                  <div className="flex flex-col items-center gap-4">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                    <p className="text-gray-500 text-lg">Loading job creation form...</p>
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
