import { DashboardKpiSkeleton, JobListSkeleton, Skeleton } from '@/app/components/ui/loading';

export default function DashboardLoading() {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 px-3 py-5 sm:px-6">
      <div className="flex flex-col gap-3 rounded-3xl border border-cyan-100 bg-white/80 p-5 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-28 rounded-md" />
          <Skeleton className="h-10 w-28 rounded-md" />
        </div>
      </div>
      <DashboardKpiSkeleton />
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-64 rounded-2xl lg:col-span-2" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-5 w-32" />
        <JobListSkeleton count={3} />
      </div>
    </div>
  );
}
