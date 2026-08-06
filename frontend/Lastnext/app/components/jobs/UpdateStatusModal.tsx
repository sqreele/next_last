"use client";

import { useState, ReactNode, MouseEvent } from "react";
import { useSession } from "@/app/lib/session.client";
import { Job, JobStatus } from "@/app/lib/types";
import { fetchWithToken } from "@/app/lib/data.server";
import { enqueueRequest } from "@/app/lib/offline-queue";
import { useT } from "@/app/lib/i18n/LocaleProvider";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/app/components/ui/dialog";
import { Button } from "@/app/components/ui/button";
import { StatusBadge } from "@/app/components/pcms-ui";
import { Textarea } from "@/app/components/ui/textarea";
import { Loader2, ArrowRight, AlertCircle } from "lucide-react";
import { cn } from "@/app/lib/utils/cn";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === "development"
    ? "http://localhost:8000"
    : "https://hotelcarepro.com");

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface UpdateStatusModalProps {
  job: Job;
  onComplete?: () => void;
  children?: ReactNode;
}

const ALL_STATUSES: Array<{ value: JobStatus; label: string; hint: string }> = [
  {
    value: "pending" as JobStatus,
    label: "Pending",
    hint: "Awaiting assignment or triage",
  },
  {
    value: "in_progress" as JobStatus,
    label: "In Progress",
    hint: "Technician is working on it",
  },
  {
    value: "waiting_sparepart" as JobStatus,
    label: "Waiting Sparepart",
    hint: "Blocked on parts arrival",
  },
  {
    value: "completed" as JobStatus,
    label: "Completed",
    hint: "Done — ready for verification",
  },
  {
    value: "cancelled" as JobStatus,
    label: "Cancelled",
    hint: "Closed without work",
  },
];

export function UpdateStatusModal({
  job,
  onComplete,
  children,
}: UpdateStatusModalProps) {
  const { data: session } = useSession();
  const t = useT();
  const [selectedStatus, setSelectedStatus] = useState<JobStatus>(job.status);
  const [note, setNote] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const statuses = ALL_STATUSES.filter((s) => s.value !== job.status);
  const isCompletingNow = selectedStatus === "completed";

  const reset = () => {
    setSelectedStatus(job.status);
    setNote("");
    setError(null);
  };

  const handleUpdate = async () => {
    if (selectedStatus === job.status) return;

    setIsUpdating(true);
    setError(null);

    try {
      const accessToken = session?.user?.accessToken;
      if (!accessToken) throw new Error(t("error.noToken"));

      await delay(400);

      const payload: Record<string, unknown> = { status: selectedStatus };
      if (note.trim()) {
        const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
        const author =
          session?.user?.username || session?.user?.first_name || "staff";
        const append = `[${stamp} · ${author} → ${selectedStatus}] ${note.trim()}`;
        payload.remarks = job.remarks ? `${job.remarks}\n${append}` : append;
      }
      if (selectedStatus === "completed") {
        payload.completed_at = new Date().toISOString();
      }

      // Detect offline up front and queue without burning a failed request.
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        enqueueRequest({
          kind: "job-status-update",
          label: `#${job.job_id} → ${selectedStatus}`,
          endpoint: `/api/v1/jobs/${job.job_id}/`,
          method: "PATCH",
          body: payload,
        });
        await delay(200);
        setOpen(false);
        reset();
        onComplete?.();
        return;
      }

      try {
        await fetchWithToken<Job>(
          `${API_BASE_URL}/api/v1/jobs/${job.job_id}/`,
          accessToken,
          "PATCH",
          payload,
        );
      } catch (networkErr: any) {
        // Treat fetch/TypeError or 5xx as transient — queue and let the
        // offline-queue hook drain when the connection returns. Throw on
        // explicit 4xx (validation, auth) so the user sees the real error.
        const msg = String(networkErr?.message || "");
        const isTransient =
          msg.toLowerCase().includes("network") ||
          msg.toLowerCase().includes("failed to fetch") ||
          msg.toLowerCase().includes("timeout") ||
          msg.toLowerCase().includes("aborted") ||
          /\b5\d\d\b/.test(msg);
        if (!isTransient) throw networkErr;
        enqueueRequest({
          kind: "job-status-update",
          label: `#${job.job_id} → ${selectedStatus}`,
          endpoint: `/api/v1/jobs/${job.job_id}/`,
          method: "PATCH",
          body: payload,
        });
      }

      await delay(200);
      setOpen(false);
      reset();
      onComplete?.();
    } catch (err: any) {
      console.error("Failed to update status:", err);
      setError(err.message || t("error.updateStatus"));
    } finally {
      setIsUpdating(false);
    }
  };

  const handleButtonClick = (e: MouseEvent) => {
    e.stopPropagation();
  };

  if (job.status === "completed") return null;

  const triggerButton = children || (
    <Button
      variant="outline"
      className="w-full text-sm h-11"
      onClick={handleButtonClick}
    >
      {t("updateStatus.title")}
    </Button>
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild onClick={handleButtonClick}>
        {triggerButton}
      </DialogTrigger>
      <DialogContent
        className="max-h-[92vh] w-[calc(100vw-1.5rem)] overflow-y-auto rounded-xl bg-card p-0 sm:max-w-md"
        onClick={handleButtonClick}
      >
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle className="text-lg font-bold text-foreground">
            {t("updateStatus.title")}
          </DialogTitle>
          <p className="text-xs font-medium text-muted-foreground">
            #{job.job_id}
          </p>
        </DialogHeader>

        <div className="space-y-5 px-5 py-4">
          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-none text-red-700" />
              <p className="text-sm font-semibold text-red-800">{error}</p>
            </div>
          )}

          <div className="rounded-xl border border-border bg-muted p-3">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              {t("updateStatus.statusChange")}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={job.status} />
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
              {selectedStatus !== job.status ? (
                <StatusBadge status={selectedStatus} />
              ) : (
                <span className="text-xs font-semibold text-muted-foreground">
                  {t("updateStatus.chooseNew")}
                </span>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-bold text-foreground">
              {t("updateStatus.setNew")}
            </p>
            <div className="grid grid-cols-1 gap-2">
              {statuses.map((status) => {
                const active = selectedStatus === status.value;
                return (
                  <button
                    key={status.value}
                    type="button"
                    onClick={() => {
                      setSelectedStatus(status.value);
                      setError(null);
                    }}
                    aria-pressed={active}
                    className={cn(
                      "flex items-center justify-between gap-3 rounded-xl border-2 p-3 text-left transition-all active:scale-[0.99] touch-manipulation min-h-[56px]",
                      active
                        ? "border-blue-600 bg-blue-50 shadow-soft"
                        : "border-border bg-card hover:border-border",
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <StatusBadge status={status.value} size="sm" />
                      <span className="text-xs font-medium text-muted-foreground line-clamp-1">
                        {status.hint}
                      </span>
                    </div>
                    <span
                      className={cn(
                        "flex h-5 w-5 flex-none items-center justify-center rounded-full border-2",
                        active
                          ? "border-blue-600 bg-blue-600"
                          : "border-border bg-card",
                      )}
                      aria-hidden="true"
                    >
                      {active && (
                        <span className="h-2 w-2 rounded-full bg-card" />
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <label
              htmlFor="status-note"
              className="text-sm font-bold text-foreground"
            >
              {t("updateStatus.addNote")}{" "}
              <span className="text-xs font-medium text-muted-foreground">
                ({t("form.optional").toLowerCase()})
              </span>
            </label>
            <Textarea
              id="status-note"
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 500))}
              placeholder={
                isCompletingNow
                  ? t("updateStatus.notePlaceholderCompleted")
                  : t("updateStatus.notePlaceholderDefault")
              }
              className="min-h-[88px] resize-none border-2 border-border text-sm"
              disabled={isUpdating}
            />
            <p className="text-right text-[11px] font-medium text-muted-foreground">
              {note.length}/500
            </p>
          </div>
        </div>

        <DialogFooter className="sticky bottom-0 flex-col gap-2 border-t border-border bg-card px-5 py-3 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isUpdating}
            className="h-11 w-full sm:w-auto"
          >
            {t("form.cancel")}
          </Button>
          <Button
            type="button"
            onClick={handleUpdate}
            disabled={isUpdating || selectedStatus === job.status}
            className="h-11 w-full bg-blue-600 font-bold text-white shadow-soft hover:bg-blue-700 disabled:bg-slate-300 sm:w-auto"
          >
            {isUpdating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t("updateStatus.saving")}
              </>
            ) : (
              t("updateStatus.confirm")
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
