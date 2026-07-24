"use client";

import type { Job } from "@/app/lib/types";
import MaintenanceJobCard from "@/app/components/jobs/MaintenanceJobCard";

type ViewMode = "grid" | "list";

interface InstagramJobCardProps {
  job: Job;
  viewMode?: ViewMode;
}

/**
 * Compatibility export for legacy imports.
 * All work-order lists now use the canonical operational card.
 */
export default function InstagramJobCard(props: InstagramJobCardProps) {
  return <MaintenanceJobCard {...props} />;
}
