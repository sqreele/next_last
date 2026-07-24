"use client";

import { SkeletonList } from "@/app/components/ui/loading";

export default function LoadingState() {
  return (
    <div aria-busy="true" aria-label="Loading preventive maintenance tasks">
      <SkeletonList rows={6} />
    </div>
  );
}
