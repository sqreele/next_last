"use client";

import dynamic from "next/dynamic";
import { Job } from "@/app/lib/types";
import { BouncingDotsLoader } from "@/app/components/ui/BouncingDotsLoader";

// ✅ PERFORMANCE: Client-side wrapper for lazy-loaded dashboard
// This ensures the component only loads on the client side

const LazyPropertyJobsDashboard = dynamic(
  () => import("@/app/components/jobs/PropertyJobsDashboard"),
  {
    loading: () => (
      <div className="flex items-center justify-center min-h-[400px]">
        <BouncingDotsLoader size="md" label="Loading dashboard..." className="text-sm text-muted-foreground" />
      </div>
    ),
    ssr: false, // Critical: prevent SSR to avoid "self is not defined" errors
  },
);

interface ChartDashboardClientProps {
  initialJobs: Job[];
}

export default function ChartDashboardClient({
  initialJobs,
}: ChartDashboardClientProps) {
  return <LazyPropertyJobsDashboard initialJobs={initialJobs} />;
}
