"use client";

import Link from "next/link";
import { Plus, X } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { FeedbackState } from "@/app/components/feedback/FeedbackState";

interface EmptyStateProps {
  hasFilters: boolean;
  currentFilters: { machine?: string };
  onClearFilters: () => void;
  getMachineNameById: (id: string) => string;
}

export default function EmptyState({
  hasFilters,
  currentFilters,
  onClearFilters,
  getMachineNameById,
}: EmptyStateProps) {
  const machineDescription =
    hasFilters && currentFilters.machine
      ? `No tasks were found for ${getMachineNameById(currentFilters.machine)}.`
      : undefined;

  return (
    <FeedbackState
      variant={hasFilters ? "no-results" : "empty"}
      title="No maintenance tasks found"
      description={
        machineDescription ??
        (hasFilters
          ? "Adjust or clear the current filters to see more tasks."
          : "Create the first preventive maintenance task for this property.")
      }
      action={
        <div className="flex flex-col gap-2 sm:flex-row">
          {hasFilters ? (
            <Button type="button" variant="outline" onClick={onClearFilters}>
              <X className="h-4 w-4" aria-hidden="true" />
              Clear filters
            </Button>
          ) : null}
          <Button asChild>
            <Link href="/dashboard/preventive-maintenance/create">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Create maintenance task
            </Link>
          </Button>
        </div>
      }
    />
  );
}
