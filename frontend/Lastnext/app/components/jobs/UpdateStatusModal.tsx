'use client';

import { useState, ReactNode, MouseEvent } from 'react';
import { useSession } from '@/app/lib/session.client';
import { Job, JobStatus } from '@/app/lib/types';
import { fetchWithToken } from '@/app/lib/data.server'; // Correct: named import
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/app/components/ui/dialog";
import { Button } from "@/app/components/ui/button";
import { StatusBadge, StatusUpdateButton } from '@/app/components/pcms-ui';
import { Label } from "@/app/components/ui/label";
import { Loader2 } from 'lucide-react';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 
  (process.env.NODE_ENV === 'development' ? 'http://localhost:8000' : 'https://pcms.live');

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

interface UpdateStatusModalProps {
  job: Job;
  onComplete?: () => void;
  children?: ReactNode;
}

export function UpdateStatusModal({ job, onComplete, children }: UpdateStatusModalProps) {
  const { data: session } = useSession();
  const [selectedStatus, setSelectedStatus] = useState<JobStatus>(job.status);
  const [isUpdating, setIsUpdating] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const statuses = [
    { value: 'pending' as JobStatus, label: 'Pending' },
    { value: 'in_progress' as JobStatus, label: 'In Progress' },
    { value: 'completed' as JobStatus, label: 'Completed' },
    { value: 'cancelled' as JobStatus, label: 'Cancelled' },
    { value: 'waiting_sparepart' as JobStatus, label: 'Waiting for Sparepart' },
  ].filter(status => status.value !== job.status);

  const handleUpdate = async () => {
    if (selectedStatus === job.status) return;

    setIsUpdating(true);
    setError(null);

    try {
      const accessToken = session?.user?.accessToken;
      if (!accessToken) {
        throw new Error('No access token available. Please log in.');
      }

      await delay(1000);
      await fetchWithToken<Job>(
        `${API_BASE_URL}/api/v1/jobs/${job.job_id}/`,
        accessToken,
        'PATCH',
        { status: selectedStatus }
      );

      await delay(300);
      setOpen(false);

      if (onComplete) {
        onComplete();
      }
    } catch (error: any) {
      console.error('Failed to update status:', error);
      setError(error.message || 'Failed to update status');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleStatusChange = (value: JobStatus) => {
    setSelectedStatus(value);
    setError(null);
  };

  const handleButtonClick = (e: MouseEvent) => {
    e.stopPropagation();
  };

  if (job.status === 'completed') return null;

  const triggerButton = children || (
    <Button 
      variant="outline" 
      className="w-full text-sm h-11"
      onClick={handleButtonClick}
    >
      Update Status
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild onClick={handleButtonClick}>
        {triggerButton}
      </DialogTrigger>
      <DialogContent 
        className="sm:max-w-[425px] max-w-[90vw] bg-white p-4 rounded-lg" 
        onClick={handleButtonClick}
      >
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-gray-800">Update Job Status</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-3">
          {error && (
            <div className="bg-red-50 text-red-600 px-3 py-2 rounded-md text-sm">
              {error}
            </div>
          )}
          <div className="space-y-2">
            <div className="font-medium text-sm text-gray-700">Current Status:</div>
            <StatusBadge status={job.status} />
          </div>
          <div className="space-y-2">
            <div className="font-medium text-sm text-gray-700">New Status:</div>
            <div className="flex flex-wrap gap-2 bg-gray-50 p-2 rounded-md">
              {statuses.map((status) => (
                <div key={status.value} className="flex">
                  <StatusUpdateButton
                    type="button"
                    status={status.value}
                    onClick={() => handleStatusChange(status.value)}
                    aria-pressed={selectedStatus === status.value}
                    className={selectedStatus === status.value ? 'ring-2 ring-offset-2 ring-[var(--pcms-primary)]' : ''}
                  >
                    {status.label}
                  </StatusUpdateButton>
                </div>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter className="flex flex-col sm:flex-row gap-2 sm:gap-0 mt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isUpdating}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleUpdate}
            disabled={isUpdating || selectedStatus === job.status}
            className="flex items-center justify-center gap-2 w-full sm:w-auto"
          >
            {isUpdating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Updating...</span>
              </>
            ) : (
              "Update Status"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}