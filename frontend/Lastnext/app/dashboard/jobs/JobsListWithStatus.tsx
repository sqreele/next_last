'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import JobList from '@/app/components/jobs/jobList';
import { Job, Property, TabValue } from '@/app/lib/types';
import { cn } from '@/app/lib/utils/cn';

interface JobsListWithStatusProps {
  jobs: Job[];
  properties: Property[];
  initialFilter: TabValue;
}

const TABS: Array<{ value: TabValue; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Open' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'waiting_sparepart', label: 'Waiting parts' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'defect', label: 'Defective' },
  { value: 'preventive_maintenance', label: 'Preventive' },
];

export function JobsListWithStatus({ jobs, properties, initialFilter }: JobsListWithStatusProps) {
  const router = useRouter();
  const [filter, setFilter] = React.useState<TabValue>(initialFilter);

  React.useEffect(() => {
    setFilter(initialFilter);
  }, [initialFilter]);

  const setStatus = (value: TabValue) => {
    setFilter(value);
    // Keep the URL in sync so deep-links/sharing work.
    const next = value === 'all' ? '/dashboard/jobs' : `/dashboard/jobs?status=${value}`;
    router.replace(next, { scroll: false });
  };

  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label="Filter jobs by status"
        className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1"
      >
        {TABS.map((tab) => {
          const active = filter === tab.value;
          return (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setStatus(tab.value)}
              className={cn(
                'flex-none rounded-full border px-3 py-1.5 text-xs font-bold transition-colors',
                active
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      <JobList jobs={jobs} filter={filter} properties={properties} />
    </div>
  );
}
