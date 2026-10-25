import { Skeleton } from "@/app/components/ui/loading";

export default function FloorPlanLoading() {
  return (
    <div className="w-full space-y-5 px-3 py-3 sm:px-4 md:px-5">
      <Skeleton className="h-24 rounded-xl" />
      <Skeleton className="h-12 rounded-xl" />
      <Skeleton className="h-[60dvh] min-h-96 rounded-xl" />
    </div>
  );
}

