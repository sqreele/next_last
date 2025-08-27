// ./app/dashboard/page.tsx
import { Suspense } from 'react';
import { fetchProperties, fetchJobs } from '@/app/lib/data.server';
import DashboardClient from '@/app/dashboard/DashboardClient';
import { getServerSession } from '@/app/lib/next-auth-compat';
import { redirect } from 'next/navigation';
import { debugConfig, debugApiUrl } from '@/app/lib/debug-config';
import { Job } from '@/app/lib/types';

export const dynamic = 'force-dynamic'; // Ensure dynamic rendering

export default async function DashboardPage() {
  // Debug configuration
  debugConfig();
  debugApiUrl();
  
  // Fetch session on the server
  const session = await getServerSession();
  
  console.log('🔍 Dashboard Session Debug:', {
    hasSession: !!session,
    hasUser: !!session?.user,
    hasAccessToken: !!session?.user?.accessToken,
    userId: session?.user?.id,
    username: session?.user?.username,
  });
  
  // Check if session exists and has a valid token
  if (!session || !session.user || !session.user.accessToken) {
    console.log('❌ No valid session, redirecting to signin');
    redirect('/auth/signin');
  }
  
  const accessToken = session.user.accessToken;
  
  try {
    console.log('🔄 Fetching properties...');
    // Fetch data using server-side functions
    const properties = await fetchProperties(accessToken);
    
    console.log('📊 Properties fetched:', {
      count: properties?.length,
      isArray: Array.isArray(properties),
      firstProperty: properties?.[0],
    });
    
    // Check if properties were successfully fetched (validates token)
    if (!properties || !Array.isArray(properties)) {
      console.error('❌ Invalid properties data or unauthorized access');
      redirect('/auth/signin?error=session_expired');
    }
    
    const firstPropertyId = properties[0]?.property_id;
    console.log('🏢 First property ID:', firstPropertyId);
    
    let jobs: Job[] = [];
    console.log('🔄 Fetching all jobs...');
    jobs = await fetchJobs(accessToken);
    console.log('📋 Jobs fetched:', { count: jobs?.length });

    // Filter jobs to current user across all properties
    const currentUserId = session.user.id;
    const currentUsername = session.user.username;
    const userJobs = Array.isArray(jobs)
      ? jobs.filter((job: Job) => {
          const jobUser = String((job as any).user);
          return jobUser === String(currentUserId) || (currentUsername && jobUser === currentUsername);
        })
      : [];
    console.log('👤 Jobs after user filter:', { count: userJobs.length });
    
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
            <DashboardClient jobs={userJobs} properties={properties} />
          </Suspense>
        </div>
      </div>
    );
  } catch (error) {
    console.error('❌ Error loading dashboard data:', error);
    
    // Log detailed error information
    if (error instanceof Error) {
      console.error('Error details:', {
        message: error.message,
        name: error.name,
        stack: error.stack,
      });
    }
    
    // Determine if it's an auth error
    const isAuthError = 
      error instanceof Error && 
      (error.message.includes('unauthorized') || 
       error.message.includes('401') || 
       error.message.includes('token') ||
       error.message.includes('Forbidden'));
    
    if (isAuthError) {
      console.log('🔐 Auth error detected, redirecting to signin');
      redirect('/auth/signin?error=session_expired');
    }
    
    // For other errors, render an error state with more details
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-pink-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center space-y-6">
          <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto">
            <svg className="w-10 h-10 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-gray-900">Dashboard Error</h1>
            <p className="text-gray-600">There was a problem loading your dashboard data.</p>
          </div>
          {process.env.NODE_ENV === 'development' && error instanceof Error && (
            <div className="text-sm text-gray-500 bg-gray-50 rounded-lg p-4 text-left">
              <p><strong>Error:</strong> {error.message}</p>
              <p><strong>Type:</strong> {error.name}</p>
            </div>
          )}
          <div className="flex flex-col sm:flex-row gap-3">
            <a 
              href="/dashboard"
              className="flex-1 px-6 py-3 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 text-center"
            >
              Try Again
            </a>
            <a 
              href="/auth/signin" 
              className="flex-1 px-6 py-3 bg-gray-600 text-white font-medium rounded-xl hover:bg-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 text-center"
            >
              Sign In Again
            </a>
          </div>
        </div>
      </div>
    );
  }
}
