'use client';

import { useState } from 'react';
import JobsContent from './JobsContent';
import { Job, Property } from '@/app/lib/types';
import { useSession } from '@/app/lib/session.client';
import { Building, Calendar } from 'lucide-react';
import { MobileTopBar } from '@/app/components/ui/mobile-nav';

interface DashboardClientProps {
  jobs: Job[];
  properties: Property[];
}

export default function DashboardClient({ jobs, properties }: DashboardClientProps) {
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  const { data: session } = useSession();

  const handleRoomFilter = (roomId: string | null) => {
    setSelectedRoom(roomId);
  };

  // Calculate job statistics
  const totalJobs = jobs.length;
  const pendingJobs = jobs.filter(job => job.status === 'pending').length;
  const inProgressJobs = jobs.filter(job => job.status === 'in_progress').length;
  const completedJobs = jobs.filter(job => job.status === 'completed').length;

  return (
    <div className="space-y-6">
      {/* Mobile Top Bar */}
      <MobileTopBar />
      
      {/* Dashboard Header */}
      <div className="pcms-page-header">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-2xl font-black tracking-[-0.03em] text-[var(--pcms-text)] sm:text-4xl">
              Welcome back, {session?.user?.username || 'User'}! 👋
            </h1>
            <p className="text-[var(--pcms-text-muted)] text-sm font-medium sm:text-base">
              Manage your maintenance jobs and property operations
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm font-bold text-[var(--pcms-text-muted)]">
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
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <div className="pcms-section-card p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-blue-100 p-2">
              <Building className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-black text-[var(--pcms-text)]">{totalJobs}</p>
              <p className="text-sm font-bold text-[var(--pcms-text-muted)]">Total Jobs</p>
            </div>
          </div>
        </div>

        <div className="pcms-section-card p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-pink-100 p-2">
              <div className="w-5 h-5 bg-yellow-500 rounded-full animate-pulse"></div>
            </div>
            <div>
              <p className="text-2xl font-black text-[var(--pcms-text)]">{pendingJobs}</p>
              <p className="text-sm font-bold text-[var(--pcms-text-muted)]">Pending</p>
            </div>
          </div>
        </div>

        <div className="pcms-section-card p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-orange-100 p-2">
              <div className="w-5 h-5 bg-orange-500 rounded-full"></div>
            </div>
            <div>
              <p className="text-2xl font-black text-[var(--pcms-text)]">{inProgressJobs}</p>
              <p className="text-sm font-bold text-[var(--pcms-text-muted)]">In Progress</p>
            </div>
          </div>
        </div>

        <div className="pcms-section-card p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-green-100 p-2">
              <div className="w-5 h-5 bg-green-500 rounded-full"></div>
            </div>
            <div>
              <p className="text-2xl font-black text-[var(--pcms-text)]">{completedJobs}</p>
              <p className="text-sm font-bold text-[var(--pcms-text-muted)]">Completed</p>
            </div>
          </div>
        </div>
      </div>

      {/* Jobs Content */}
      <div className="pcms-workspace-card overflow-hidden">
        <JobsContent 
          jobs={jobs} 
          properties={properties}
          selectedRoom={selectedRoom}
          onRoomFilter={handleRoomFilter}
        />
      </div>
      
      
    </div>
  );
} 