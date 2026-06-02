import { Card, CardContent } from '@/app/components/ui/card';

function SkeletonBlock({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-gray-200 ${className}`} />;
}

export default function Loading() {
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-2">
              <SkeletonBlock className="h-4 w-36" />
              <SkeletonBlock className="h-7 w-48" />
              <SkeletonBlock className="h-4 w-64 max-w-full" />
            </div>
            <SkeletonBlock className="h-11 w-full sm:w-44" />
          </div>
          <div className="mt-5 flex gap-2 overflow-hidden">
            {Array.from({ length: 6 }).map((_, index) => (
              <SkeletonBlock key={index} className="h-9 w-24 shrink-0" />
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 sm:p-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="rounded-xl border border-gray-200 p-4">
                <SkeletonBlock className="h-5 w-28" />
                <SkeletonBlock className="mt-3 h-4 w-20" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
