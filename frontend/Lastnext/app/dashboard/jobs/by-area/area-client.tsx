'use client';

import React from 'react';
import { Job } from '@/app/lib/types';
import InstagramJobCard from '@/app/components/jobs/InstagramJobCard';
import { Badge } from '@/app/components/ui/badge';
import { Card, CardContent } from '@/app/components/ui/card';
import { SearchInput, MobileTopBar } from '@/app/components/pcms-ui';
import { AlertCircle, MapPin } from 'lucide-react';

type AreaGroup = {
  key: string;
  label: string;
  propertyName?: string | null;
  jobs: Job[];
};

const NO_AREA_KEY = '__no_area__';
const NO_AREA_LABEL = 'No Area';

function getAreaLabel(job: Job): string {
  const areaName = job.area?.name || job.area_name;
  return areaName && areaName.trim() ? areaName.trim() : NO_AREA_LABEL;
}

function getAreaKey(job: Job): string {
  const areaId = job.area?.id || job.area_id;
  if (areaId) return `area-${areaId}`;
  const areaName = job.area?.name || job.area_name;
  if (areaName && areaName.trim()) return `area-name-${areaName.trim().toLowerCase()}`;
  return NO_AREA_KEY;
}

function getAreaPropertyName(job: Job): string | null {
  return job.area?.property_name || null;
}

function sortGroups(groups: AreaGroup[]): AreaGroup[] {
  return groups.sort((a, b) => {
    if (a.key === NO_AREA_KEY) return 1;
    if (b.key === NO_AREA_KEY) return -1;
    return a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' });
  });
}

export default function JobsByAreaClient({ initialJobs }: { initialJobs: Job[] }) {
  const [query, setQuery] = React.useState('');

  const filteredJobs = React.useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return initialJobs;

    return initialJobs.filter((job) => [
      job.job_id,
      job.description,
      job.remarks,
      job.status,
      job.priority,
      job.topics?.[0]?.title,
      job.rooms?.[0]?.name,
      job.area?.name,
      job.area_name,
    ].some((value) => String(value || '').toLowerCase().includes(term)));
  }, [initialJobs, query]);

  const groups = React.useMemo(() => {
    const byArea = new Map<string, AreaGroup>();

    for (const job of filteredJobs) {
      const key = getAreaKey(job);
      const existing = byArea.get(key);
      if (existing) {
        existing.jobs.push(job);
        continue;
      }

      byArea.set(key, {
        key,
        label: getAreaLabel(job),
        propertyName: getAreaPropertyName(job),
        jobs: [job],
      });
    }

    return sortGroups(Array.from(byArea.values()));
  }, [filteredJobs]);

  const noAreaCount = groups.find((group) => group.key === NO_AREA_KEY)?.jobs.length || 0;

  return (
    <div className="space-y-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
      <MobileTopBar title="Jobs by Area" />

      <Card className="border-cyan-100 bg-white/95 shadow-sm">
        <CardContent className="space-y-4 p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-cyan-700">Maintenance locations</p>
              <h1 className="text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">Jobs by Area</h1>
              <p className="text-sm font-semibold text-slate-600">
                {filteredJobs.length} job{filteredJobs.length === 1 ? '' : 's'} grouped into {groups.length} area{groups.length === 1 ? '' : 's'}.
              </p>
            </div>
            {noAreaCount > 0 && (
              <Badge variant="outline" className="w-fit border-amber-200 bg-amber-50 px-3 py-1 text-amber-800">
                <AlertCircle className="mr-1.5 h-3.5 w-3.5" /> {noAreaCount} No Area
              </Badge>
            )}
          </div>

          <SearchInput
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by area, room, job ID, status, or description..."
            aria-label="Search jobs by area"
          />

          <div className="-mx-1 overflow-x-auto px-1 pb-1 scrollbar-none">
            <div className="flex min-w-max items-center gap-2">
              {groups.map((group) => (
                <a
                  key={group.key}
                  href={`#${group.key}`}
                  className="inline-flex min-h-10 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 shadow-sm touch-manipulation"
                >
                  <MapPin className="h-3.5 w-3.5 text-cyan-600" />
                  <span>{group.label}</span>
                  <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">{group.jobs.length}</span>
                </a>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {groups.length === 0 ? (
        <Card className="border-dashed border-slate-300 bg-white/80">
          <CardContent className="p-8 text-center">
            <p className="text-lg font-black text-slate-900">No jobs found</p>
            <p className="mt-1 text-sm font-medium text-slate-600">Create a job with Area = Bathroom to see it grouped under Bathroom here.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <section key={group.key} id={group.key} className="scroll-mt-24 space-y-3">
              <div className="sticky top-0 z-10 rounded-2xl border border-white/80 bg-white/90 px-3 py-3 shadow-sm backdrop-blur sm:static sm:px-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="flex items-center gap-2 text-xl font-black tracking-tight text-slate-950">
                      <MapPin className="h-5 w-5 shrink-0 text-cyan-600" />
                      <span className="truncate">{group.label}</span>
                    </h2>
                    {group.propertyName && <p className="mt-0.5 text-xs font-bold text-slate-500">{group.propertyName}</p>}
                  </div>
                  <Badge className="bg-cyan-600 text-white">{group.jobs.length} job{group.jobs.length === 1 ? '' : 's'}</Badge>
                </div>
              </div>

              <div className="pcms-job-grid auto-rows-fr">
                {group.jobs.map((job) => (
                  <div key={job.job_id} className="h-full touch-action-manipulation">
                    <InstagramJobCard job={job} />
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
