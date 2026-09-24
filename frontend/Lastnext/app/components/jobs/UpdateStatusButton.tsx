// UpdateStatusButton.tsx
"use client";

import React, { useState } from "react";
import { Button } from "@/app/components/ui/button";
import { ClipboardEdit, ImagePlus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
import { Label } from "@/app/components/ui/label";
import { Job, JobStatus } from "@/app/lib/types";
import { requestMyJobStatusUpdate } from "@/app/lib/hooks/my-job-status-update.mjs";
import { useToast } from "@/app/components/ui/use-toast";
import { useSession } from "@/app/lib/session.client";
import { cn } from "@/app/lib/utils/cn";
import { normalizeStatus } from "@/app/components/StatusBadge";
import { getStatusConfig } from "@/app/design-system/status-config";
import FileUpload from "@/app/components/jobs/FileUpload";
import { useT } from "@/app/lib/i18n/LocaleProvider";

const MAX_AFTER_IMAGES = 5;

// Define status constants
const JOB_STATUS = {
  PENDING: "pending",
  IN_PROGRESS: "in_progress",
  WAITING_SPAREPART: "waiting_sparepart",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
};

interface UpdateStatusButtonProps {
  job: Job;
  activePropertyId: string;
  onStatusUpdated: (updatedJob: Job) => void;
  variant?:
    | "default"
    | "outline"
    | "destructive"
    | "secondary"
    | "success"
    | "warning"
    | "ghost"
    | "link";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
  buttonText?: string;
  onClick?: (e: React.MouseEvent) => void;
}

const UpdateStatusButton: React.FC<UpdateStatusButtonProps> = ({
  job,
  activePropertyId,
  onStatusUpdated,
  variant = "outline",
  size = "sm",
  className = "",
  buttonText = "Update Status",
  onClick,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<JobStatus>(
    job.status as JobStatus,
  );
  const [afterImages, setAfterImages] = useState<File[]>([]);
  const [uploadResetKey, setUploadResetKey] = useState(0);
  const { toast } = useToast();
  const { status } = useSession();
  const t = useT();
  const currentStatusTone = normalizeStatus(job.status);
  const selectedStatusTone = normalizeStatus(selectedStatus);
  const currentStatusConfig = getStatusConfig(currentStatusTone);
  const selectedStatusConfig = getStatusConfig(selectedStatusTone);
  const isCompleted = currentStatusTone === JOB_STATUS.COMPLETED;

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (open) {
      // Reset the selected status to the current job status when opening
      setSelectedStatus(job.status as JobStatus);
      setAfterImages([]);
      setUploadResetKey((current) => current + 1);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Debug logging

    // Check session status first
    if (status === "loading") {
      toast({
        title: "Loading",
        description: "Please wait while we load your session...",
        variant: "default",
      });
      return;
    }

    if (status === "unauthenticated") {
      toast({
        title: "Authentication Required",
        description: "Please log in to update job status",
        variant: "destructive",
      });
      return;
    }

    if (selectedStatus === job.status) {
      setIsOpen(false);
      return; // No change needed
    }

    setIsSubmitting(true);
    try {
      const updatedJob = await requestMyJobStatusUpdate({
        jobId: job.job_id,
        propertyId: activePropertyId,
        status: selectedStatus,
        afterImages,
      }) as Job;

      // Update local state
      onStatusUpdated(updatedJob);

      // Show success message
      toast({
        title: "Status Updated",
        description: `Job #${job.job_id} status changed to ${selectedStatus.replace("_", " ")}`,
      });

      // Close dialog
      setIsOpen(false);
    } catch (error) {
      console.error("Failed to update status:", error);
      toast({
        title: "Update Failed",
        description:
          error instanceof Error
            ? error.message
            : "Failed to update job status",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Button
        onClick={(e) => {
          // If onClick handler is provided, call it
          if (onClick) {
            onClick(e);
          }
          // Always stop propagation to prevent parent click events
          e.stopPropagation();
          if (isCompleted) {
            return;
          }
          setIsOpen(true);
        }}
        variant={variant}
        size={size}
        className={cn(
          "h-11 border-2 font-bold shadow-soft",
          className,
          currentStatusConfig.className,
        )}
        disabled={
          status === "loading" || status === "unauthenticated" || isCompleted
        }
        isLoading={status === "loading"}
        loadingText="Loading..."
        title={
          isCompleted
            ? "Completed jobs cannot have their status changed"
            : buttonText
        }
      >
        <ClipboardEdit className="h-4 w-4 mr-2" />
        {isCompleted ? "Status Locked" : buttonText}
      </Button>

      <Dialog open={isOpen} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Update Job Status</DialogTitle>
            <DialogDescription>
              Change the status for job #{job.job_id}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="status" className="text-sm font-medium">
                Status
              </Label>
              <Select
                value={selectedStatus}
                onValueChange={(value: JobStatus) => {
                  setSelectedStatus(value);
                  if (value !== JOB_STATUS.COMPLETED) {
                    setAfterImages([]);
                    setUploadResetKey((current) => current + 1);
                  }
                }}
                disabled={isSubmitting || isCompleted}
              >
                <SelectTrigger
                  id="status"
                  className={cn(
                    "border-2 text-sm font-bold",
                    selectedStatusConfig.className,
                  )}
                >
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={JOB_STATUS.PENDING} className="text-sm">
                    Pending
                  </SelectItem>
                  <SelectItem
                    value={JOB_STATUS.IN_PROGRESS}
                    className="text-sm"
                  >
                    In Progress
                  </SelectItem>
                  <SelectItem
                    value={JOB_STATUS.WAITING_SPAREPART}
                    className="text-sm"
                  >
                    Waiting Sparepart
                  </SelectItem>
                  <SelectItem value={JOB_STATUS.COMPLETED} className="text-sm">
                    Completed
                  </SelectItem>
                  <SelectItem value={JOB_STATUS.CANCELLED} className="text-sm">
                    Cancelled
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {selectedStatus === JOB_STATUS.COMPLETED && (
              <div className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
                <div className="flex items-start gap-2">
                  <ImagePlus className="mt-0.5 h-4 w-4 flex-none text-emerald-700" />
                  <div>
                    <Label className="text-sm font-bold text-emerald-950">
                      {t("updateStatus.afterImages")}
                    </Label>
                    <p className="mt-0.5 text-xs text-emerald-800">
                      {t("updateStatus.afterImagesHint")}
                    </p>
                  </div>
                </div>
                <FileUpload
                  key={uploadResetKey}
                  onFileSelect={setAfterImages}
                  maxFiles={MAX_AFTER_IMAGES}
                  maxSize={5}
                  disabled={isSubmitting}
                />
              </div>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting || selectedStatus === job.status}
                isLoading={isSubmitting}
                loadingText="Saving..."
                className={cn(
                  "font-bold",
                  selectedStatusConfig.buttonClassName,
                )}
              >
                Update
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default UpdateStatusButton;
