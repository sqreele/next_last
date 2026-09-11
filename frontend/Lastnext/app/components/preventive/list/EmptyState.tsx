"use client";

import Link from "next/link";
import { Plus, X } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { FeedbackState } from "@/app/components/feedback/FeedbackState";
import { useT } from "@/app/lib/i18n/LocaleProvider";

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
  const t = useT();
  const machineDescription =
    hasFilters && currentFilters.machine
      ? t("pm.noTasksMachine", { name: getMachineNameById(currentFilters.machine) })
      : undefined;

  return (
    <FeedbackState
      variant={hasFilters ? "no-results" : "empty"}
      title={t("pm.noTasks")}
      description={
        machineDescription ??
        (hasFilters
          ? t("pm.adjustFilters")
          : t("pm.createFirst"))
      }
      action={
        <div className="flex flex-col gap-2 sm:flex-row">
          {hasFilters ? (
            <Button type="button" variant="outline" onClick={onClearFilters}>
              <X className="h-4 w-4" aria-hidden="true" />
              {t("inventory.clearFilters")}
            </Button>
          ) : null}
          <Button asChild>
            <Link href="/dashboard/preventive-maintenance/create">
              <Plus className="h-4 w-4" aria-hidden="true" />
              {t("pm.createTask")}
            </Link>
          </Button>
        </div>
      }
    />
  );
}
