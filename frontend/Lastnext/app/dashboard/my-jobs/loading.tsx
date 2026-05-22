import { JobListSkeleton, Skeleton } from '@/app/components/ui/loading';

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 px-3 py-5 sm:px-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-7 w-48" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-32 rounded-md" />
          <Skeleton className="h-10 w-24 rounded-md" />
        </div>
      </div>
      <Skeleton className="h-12 w-full rounded-xl" />
      <JobListSkeleton count={6} />
    </div>
  );
}
