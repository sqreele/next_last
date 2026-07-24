"use client";

import React, { FC, useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Loader } from "lucide-react";
import { Job } from "@/app/lib/types";
import { Button } from "@/app/components/ui/button";
import { Checkbox } from "@/app/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/app/components/ui/dialog";
import { Textarea } from "@/app/components/ui/textarea";
import { Label } from "@/app/components/ui/label";
import { Input } from "@/app/components/ui/input";
import { StatusBadge } from "@/app/components/pcms-ui";
import { cn } from "@/app/lib/utils/cn";
import { useT } from "@/app/lib/i18n/LocaleProvider";

const JOB_PRIORITY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

const JOB_STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "in_progress", label: "In Progress" },
  { value: "waiting_sparepart", label: "Waiting Sparepart" },
  { value: "completed", label: "Completed" },
];

interface EditDialogProps {
  isOpen: boolean;
  onClose: () => void;
  job: Job | null;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
  isSubmitting: boolean;
}

const EditJobDialog: FC<EditDialogProps> = ({
  isOpen,
  onClose,
  job,
  onSubmit,
  isSubmitting,
}) => {
  const t = useT();
  const [priority, setPriority] = useState<string>(job?.priority || "medium");
  const [status, setStatus] = useState<string>(job?.status || "pending");
  const [showTimestamps, setShowTimestamps] = useState(false);

  useEffect(() => {
    if (job) {
      setPriority(job.priority || "medium");
      setStatus(job.status || "pending");
      setShowTimestamps(false);
    }
  }, [job?.job_id, job?.priority, job?.status]);

  const formatTimestampForInput = (
    timestamp: string | null | undefined,
  ): string => {
    if (!timestamp) return "";
    try {
      const date = new Date(timestamp);
      if (Number.isNaN(date.getTime())) return "";
      const tzOffset = date.getTimezoneOffset() * 60000;
      return new Date(date.getTime() - tzOffset).toISOString().slice(0, 16);
    } catch {
      return "";
    }
  };

  if (!isOpen || !job) return null;

  const priorityColors: Record<string, { active: string; inactive: string }> = {
    low: {
      active: "bg-green-500 text-white border-green-500 shadow-soft",
      inactive: "border-green-200 text-green-700 hover:bg-green-50",
    },
    medium: {
      active: "bg-yellow-500 text-white border-yellow-500 shadow-soft",
      inactive: "border-yellow-200 text-yellow-700 hover:bg-yellow-50",
    },
    high: {
      active: "bg-orange-500 text-white border-orange-500 shadow-soft",
      inactive: "border-orange-200 text-orange-700 hover:bg-orange-50",
    },
    critical: {
      active: "bg-red-600 text-white border-red-600 shadow-soft",
      inactive: "border-red-200 text-red-700 hover:bg-red-50",
    },
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="relative max-h-[92vh] w-[calc(100vw-1.5rem)] overflow-y-auto rounded-xl p-0 sm:max-w-lg">
        {isSubmitting && (
          <div
            className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-5 bg-card/95 backdrop-blur-sm"
            aria-live="polite"
            aria-busy="true"
            role="status"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-100 shadow-inner">
              <Loader
                className="h-8 w-8 animate-spin text-blue-600"
                aria-hidden
              />
            </div>
            <p className="text-center text-lg font-medium text-muted-foreground">
              {t("editJob.savingOverlay")}
            </p>
          </div>
        )}

        <DialogHeader className="border-b border-border px-5 py-4 text-left">
          <DialogTitle className="text-lg font-bold text-foreground">
            {t("editJob.title")} #{job.job_id}
          </DialogTitle>
          <DialogDescription className="text-xs font-medium text-muted-foreground">
            {t("editJob.subtitle")}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-5 px-5 py-4">
          {/* Hidden fields drive the form payload from our controlled chip selectors. */}
          <input type="hidden" name="status" value={status} />
          <input type="hidden" name="priority" value={priority} />

          <div className="space-y-2">
            <Label
              htmlFor="description"
              className="text-sm font-bold text-foreground"
            >
              {t("editJob.description")}
            </Label>
            <Textarea
              id="description"
              name="description"
              defaultValue={job.description}
              className="min-h-[96px] border-2 border-border text-sm"
              required
              aria-required="true"
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-bold text-foreground">
              {t("editJob.status")}
            </Label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {JOB_STATUS_OPTIONS.map((option) => {
                const active = status === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setStatus(option.value)}
                    disabled={isSubmitting}
                    aria-pressed={active}
                    className={cn(
                      "flex min-h-[56px] flex-col items-start justify-center rounded-xl border-2 px-3 py-2 text-left transition-all touch-manipulation active:scale-[0.98]",
                      active
                        ? "border-blue-600 bg-blue-50 shadow-soft"
                        : "border-border bg-card hover:border-border",
                    )}
                  >
                    <StatusBadge status={option.value} size="sm" />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-bold text-foreground">
              {t("editJob.priority")}
            </Label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {JOB_PRIORITY_OPTIONS.map((option) => {
                const active = priority === option.value;
                const colors =
                  priorityColors[option.value] || priorityColors.medium;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setPriority(option.value)}
                    disabled={isSubmitting}
                    aria-pressed={active}
                    className={cn(
                      "min-h-[44px] touch-manipulation rounded-xl border-2 px-3 py-2 text-sm font-bold transition-all duration-150 active:scale-95",
                      active ? colors.active : colors.inactive,
                    )}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="remarks"
              className="text-sm font-bold text-foreground"
            >
              {t("editJob.remarks")}{" "}
              <span className="text-xs font-medium text-muted-foreground">
                ({t("form.optional").toLowerCase()})
              </span>
            </Label>
            <Textarea
              id="remarks"
              name="remarks"
              defaultValue={job.remarks || ""}
              className="min-h-[72px] border-2 border-border text-sm"
              disabled={isSubmitting}
            />
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label
              htmlFor="is_defective"
              className="flex items-center gap-3 rounded-xl border-2 border-border bg-card p-3 cursor-pointer touch-manipulation"
            >
              <Checkbox
                id="is_defective"
                name="is_defective"
                defaultChecked={job.is_defective}
                disabled={isSubmitting}
                className="h-5 w-5"
              />
              <span className="text-sm font-semibold text-foreground">
                {t("editJob.markDefective")}
              </span>
            </label>
            <label
              htmlFor="is_preventivemaintenance"
              className="flex items-center gap-3 rounded-xl border-2 border-border bg-card p-3 cursor-pointer touch-manipulation"
            >
              <Checkbox
                id="is_preventivemaintenance"
                name="is_preventivemaintenance"
                defaultChecked={job.is_preventivemaintenance}
                disabled={isSubmitting}
                className="h-5 w-5"
              />
              <span className="text-sm font-semibold text-foreground">
                {t("editJob.preventive")}
              </span>
            </label>
          </div>

          <div className="rounded-xl border-2 border-border bg-card">
            <button
              type="button"
              onClick={() => setShowTimestamps((value) => !value)}
              className="flex w-full items-center justify-between p-3 text-sm font-bold text-foreground touch-manipulation"
              aria-expanded={showTimestamps}
            >
              <span>{t("editJob.editTimestamps")}</span>
              {showTimestamps ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>
            {showTimestamps && (
              <div className="space-y-3 border-t border-border p-3">
                <div className="space-y-1">
                  <Label
                    htmlFor="created_at"
                    className="text-xs font-bold text-muted-foreground"
                  >
                    {t("editJob.createdAt")}
                  </Label>
                  <Input
                    id="created_at"
                    name="created_at"
                    type="datetime-local"
                    defaultValue={formatTimestampForInput(job.created_at)}
                    className="text-sm"
                    disabled={isSubmitting}
                  />
                </div>
                <div className="space-y-1">
                  <Label
                    htmlFor="updated_at"
                    className="text-xs font-bold text-muted-foreground"
                  >
                    {t("editJob.updatedAt")}
                  </Label>
                  <Input
                    id="updated_at"
                    name="updated_at"
                    type="datetime-local"
                    defaultValue={formatTimestampForInput(job.updated_at)}
                    className="text-sm"
                    disabled={isSubmitting}
                  />
                </div>
                <div className="space-y-1">
                  <Label
                    htmlFor="completed_at"
                    className="text-xs font-bold text-muted-foreground"
                  >
                    {t("editJob.completedAt")}
                  </Label>
                  <Input
                    id="completed_at"
                    name="completed_at"
                    type="datetime-local"
                    defaultValue={formatTimestampForInput(job.completed_at)}
                    className="text-sm"
                    disabled={isSubmitting}
                  />
                  <p className="text-xs font-medium text-muted-foreground">
                    {t("editJob.completedHint")}
                  </p>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="sticky bottom-0 -mx-5 flex-col gap-2 border-t border-border bg-card px-5 pb-2 pt-3 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
              className="h-11 w-full sm:w-auto"
            >
              {t("form.cancel")}
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="h-11 w-full bg-blue-600 font-bold text-white hover:bg-blue-700 sm:w-auto"
            >
              {isSubmitting && <Loader className="mr-2 h-4 w-4 animate-spin" />}
              {t("editJob.saveChanges")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

EditJobDialog.displayName = "EditJobDialog";
export default EditJobDialog;
