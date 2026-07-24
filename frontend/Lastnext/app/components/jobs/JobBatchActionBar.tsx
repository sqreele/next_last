"use client";

import React, { useState } from "react";
import { useSession } from "@/app/lib/session.client";
import {
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  X,
  Wrench,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Job, JobStatus, Property } from "@/app/lib/types";
import { fetchWithToken } from "@/app/lib/data.server";
import { jobsToCSV, downloadCSV } from "@/app/lib/utils/csv-export";
import { exportJobsToExcel } from "@/app/lib/utils/excel-export";
import { StatusBadge } from "@/app/components/pcms-ui";
import { cn } from "@/app/lib/utils/cn";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === "development"
    ? "http://localhost:8000"
    : "https://hotelcarepro.com");

interface JobBatchActionBarProps {
  selected: Job[];
  totalVisible: number;
  properties?: Property[];
  onClear: () => void;
  onSelectAll: () => void;
  onComplete?: () => void;
  className?: string;
}

const QUICK_STATUSES: Array<{ value: JobStatus; label: string }> = [
  { value: "in_progress", label: "In progress" },
  { value: "waiting_sparepart", label: "Waiting parts" },
  { value: "completed", label: "Completed" },
];

export function JobBatchActionBar({
  selected,
  totalVisible,
  properties = [],
  onClear,
  onSelectAll,
  onComplete,
  className,
}: JobBatchActionBarProps) {
  const { data: session } = useSession();
  const [working, setWorking] = useState<null | "status" | "csv" | "xlsx">(
    null,
  );
  const [statusPickerOpen, setStatusPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!selected.length) return null;

  const applyStatus = async (newStatus: JobStatus) => {
    setError(null);
    setStatusPickerOpen(false);
    if (!session?.user?.accessToken) {
      setError("Please sign in again before bulk-updating.");
      return;
    }
    setWorking("status");
    try {
      const accessToken = session.user.accessToken;
      let failed = 0;
      for (const job of selected) {
        try {
          const payload: Record<string, unknown> = { status: newStatus };
          if (newStatus === "completed") {
            payload.completed_at = new Date().toISOString();
          }
          await fetchWithToken(
            `${API_BASE_URL}/api/v1/jobs/${job.job_id}/`,
            accessToken,
            "PATCH",
            payload,
          );
        } catch (err) {
          console.warn("Bulk status update failed for", job.job_id, err);
          failed += 1;
        }
      }
      if (failed) {
        setError(
          `Updated ${selected.length - failed} of ${selected.length} jobs. ${failed} failed.`,
        );
      } else {
        onClear();
        onComplete?.();
      }
    } finally {
      setWorking(null);
    }
  };

  const exportCsv = () => {
    const csv = jobsToCSV(selected, properties, {
      includeImages: false,
      includeUserDetails: true,
      includeRoomDetails: true,
      includePropertyDetails: true,
      dateFormat: "readable",
    });
    downloadCSV(
      csv,
      `selected-jobs-${new Date().toISOString().split("T")[0]}.csv`,
    );
  };

  const exportXlsx = () => {
    setWorking("xlsx");
    try {
      exportJobsToExcel(selected, properties, {
        propertyName: "Selected jobs",
        filterDescription: `Selected ${selected.length} jobs`,
        filename: `selected-jobs-${new Date().toISOString().split("T")[0]}.xlsx`,
        includeImages: false,
        includeUserDetails: true,
        includeRoomDetails: true,
        includePropertyDetails: true,
        dateFormat: "readable",
      });
    } finally {
      setWorking(null);
    }
  };

  return (
    <div
      role="region"
      aria-label="Batch actions"
      className={cn(
        "sticky bottom-3 z-40 mx-auto flex w-full max-w-3xl flex-col gap-2 rounded-xl border border-border bg-card px-3 py-3 shadow-card sm:flex-row sm:items-center sm:gap-3",
        className,
      )}
      style={{ marginBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex flex-1 items-center gap-3">
        <span className="grid h-9 w-9 flex-none place-items-center rounded-xl bg-blue-600 text-sm font-black text-white">
          {selected.length}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold text-foreground">
            {selected.length} of {totalVisible} selected
          </p>
          <button
            type="button"
            onClick={selected.length === totalVisible ? onClear : onSelectAll}
            className="text-xs font-bold text-blue-700 hover:underline"
          >
            {selected.length === totalVisible
              ? "Clear selection"
              : "Select all visible"}
          </button>
        </div>
      </div>

      {error && <p className="text-xs font-semibold text-rose-700">{error}</p>}

      <div className="flex flex-wrap items-center justify-end gap-2 sm:flex-none">
        <div className="relative">
          <Button
            type="button"
            onClick={() => setStatusPickerOpen((s) => !s)}
            disabled={working !== null}
            className="h-10 bg-blue-600 text-sm font-bold text-white hover:bg-blue-700"
          >
            {working === "status" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Wrench className="mr-2 h-4 w-4" />
            )}
            Status
          </Button>
          {statusPickerOpen && (
            <div className="absolute bottom-full right-0 z-50 mb-2 flex w-56 flex-col gap-1 rounded-xl border border-border bg-card p-2 shadow-card">
              {QUICK_STATUSES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => applyStatus(s.value)}
                  className="flex items-center justify-between gap-2 rounded-lg px-2 py-2 text-sm font-semibold text-foreground hover:bg-muted"
                >
                  <StatusBadge status={s.value} size="sm" />
                  <span className="text-[11px] text-muted-foreground">
                    → {selected.length} job{selected.length > 1 ? "s" : ""}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={exportXlsx}
          disabled={working !== null}
          className="h-10 border-emerald-600 text-emerald-700 hover:bg-emerald-50"
        >
          {working === "xlsx" ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <FileSpreadsheet className="mr-2 h-4 w-4" />
          )}
          Excel
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={exportCsv}
          disabled={working !== null}
          className="h-10"
        >
          CSV
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={onClear}
          className="h-10 px-2"
          aria-label="Exit selection mode"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
