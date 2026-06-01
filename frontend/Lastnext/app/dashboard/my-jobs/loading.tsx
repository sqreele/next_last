import { JobListSkeleton, Skeleton } from '@/app/components/ui/loading';

export default function Loading() {
  return (
    <div className="w-full max-w-none space-y-5 px-3 py-4 sm:px-6 sm:py-5 lg:mx-auto lg:max-w-7xl">
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
