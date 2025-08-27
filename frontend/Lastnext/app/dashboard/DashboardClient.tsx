'use client';

import { useMemo, useState, useCallback } from 'react';
import JobsContent from './JobsContent';
import { Job, Property } from '@/app/lib/types';
import { useSession } from 'next-auth/react';
import { Building, User, Calendar } from 'lucide-react';
import { MobileTopBar } from '@/app/components/ui/mobile-nav';

interface DashboardClientProps {
  jobs: Job[];
  properties: Property[];
}

export default function DashboardClient({ jobs, properties }: DashboardClientProps) {
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  const { data: session } = useSession();
  const [localJobs, setLocalJobs] = useState<Job[]>(jobs);

  const handleRoomFilter = (roomId: string | null) => {
    setSelectedRoom(roomId);
  };

  const handleJobUpdated = useCallback((updatedJob: Job) => {
    setLocalJobs(prev => prev.map(j => String(j.job_id) === String(updatedJob.job_id) ? updatedJob : j));
  }, []);

  // Calculate job statistics from localJobs
  const { totalJobs, pendingJobs, inProgressJobs, completedJobs } = useMemo(() => {
    const total = localJobs.length;
    const pending = localJobs.filter(job => job.status === 'pending').length;
    const inProgress = localJobs.filter(job => job.status === 'in_progress').length;
    const completed = localJobs.filter(job => job.status === 'completed').length;
    return { totalJobs: total, pendingJobs: pending, inProgressJobs: inProgress, completedJobs: completed };
  }, [localJobs]);

  return (
    <div className="space-y-6">
      {/* Mobile Top Bar */}
      <MobileTopBar />
      
      {/* Dashboard Header */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
              Welcome back, {session?.user?.username || 'User'}! 👋
            </h1>
            <p className="text-gray-600 text-sm sm:text-base">
              Manage your maintenance jobs and property operations
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Calendar className="w-4 h-4" />
            <span>{new Date().toLocaleDateString('en-US', { 
              weekday: 'long', 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric' 
            })}</span>
          </div>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Building className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{totalJobs}</p>
              <p className="text-sm text-gray-600">Total Jobs</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-yellow-100 rounded-lg">
              <div className="w-5 h-5 bg-yellow-500 rounded-full animate-pulse"></div>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{pendingJobs}</p>
              <p className="text-sm text-gray-600">Pending</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-100 rounded-lg">
              <div className="w-5 h-5 bg-orange-500 rounded-full"></div>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{inProgressJobs}</p>
              <p className="text-sm text-gray-600">In Progress</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <div className="w-5 h-5 bg-green-500 rounded-full"></div>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{completedJobs}</p>
              <p className="text-sm text-gray-600">Completed</p>
            </div>
          </div>
        </div>
      </div>

      {/* Jobs Content */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <JobsContent 
          jobs={localJobs} 
          properties={properties}
          selectedRoom={selectedRoom}
          onRoomFilter={handleRoomFilter}
          onJobUpdated={handleJobUpdated}
        />
      </div>
      
      
    </div>
  );
} 