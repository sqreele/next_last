import { JobListSkeleton, Skeleton } from '@/app/components/ui/loading';

export default function Loading() {
  return (
    <div className="w-full max-w-none space-y-5 px-3 py-4 sm:px-6 sm:py-6 lg:mx-auto lg:max-w-7xl lg:px-8">
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="space-y-2">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-64 max-w-full" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-24 rounded-lg" />
        ))}
      </div>
      <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
        <Skeleton className="h-5 w-24" />
        <div className="mt-3 grid gap-3 lg:grid-cols-[1.4fr_0.8fr_0.8fr_0.8fr_1fr_auto]">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-11 rounded-md" />
          ))}
        </div>
      </div>
      <JobListSkeleton count={6} className="grid gap-3 lg:grid-cols-2" />
    </div>
  );
}
