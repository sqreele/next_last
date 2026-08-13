// UpdateStatusButton.tsx
"use client";

import React, { useEffect, useRef, useState } from "react";
import { Button } from "@/app/components/ui/button";
import { ClipboardEdit } from "lucide-react";
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
import { updateJobStatus } from "@/app/lib/data.server";
import { useToast } from "@/app/components/ui/use-toast";
import { useSession } from "@/app/lib/session.client";
import { cn } from "@/app/lib/utils/cn";
import { normalizeStatus } from "@/app/components/StatusBadge";

// Define status constants
const JOB_STATUS = {
  PENDING: "pending",
  IN_PROGRESS: "in_progress",
  WAITING_SPAREPART: "waiting_sparepart",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
};

const STATUS_BUTTON_CLASSES: Record<string, string> = {
  pending:
    "border-blue-300 bg-blue-50 text-blue-800 hover:border-blue-400 hover:bg-blue-100 hover:text-blue-900",
  in_progress:
    "border-indigo-300 bg-indigo-50 text-indigo-800 hover:border-indigo-400 hover:bg-indigo-100 hover:text-indigo-900",
  waiting_sparepart:
    "border-orange-300 bg-orange-50 text-orange-800 hover:border-orange-400 hover:bg-orange-100 hover:text-orange-900",
  completed:
    "border-emerald-300 bg-emerald-50 text-emerald-800 hover:border-emerald-400 hover:bg-emerald-100 hover:text-emerald-900",
  cancelled:
    "border-red-300 bg-red-50 text-red-800 hover:border-red-400 hover:bg-red-100 hover:text-red-900",
  overdue:
    "border-red-400 bg-red-100 text-red-900 hover:border-red-500 hover:bg-red-200",
};

const STATUS_SUBMIT_CLASSES: Record<string, string> = {
  pending: "bg-blue-700 text-white hover:bg-blue-800",
  in_progress: "bg-indigo-700 text-white hover:bg-indigo-800",
  waiting_sparepart: "bg-orange-700 text-white hover:bg-orange-800",
  completed: "bg-emerald-700 text-white hover:bg-emerald-800",
  cancelled: "bg-red-700 text-white hover:bg-red-800",
  overdue: "bg-red-800 text-white hover:bg-red-900",
};

interface UpdateStatusButtonProps {
  job: Job;
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
  propertyContextKey?: string | null;
}

interface MutationContext {
  jobId: string;
  propertyContextKey: string | null;
  sessionUserId: string;
  accessToken: string;
}

function sameMutationContext(left: MutationContext, right: MutationContext) {
  return (
    left.jobId === right.jobId &&
    left.propertyContextKey === right.propertyContextKey &&
    left.sessionUserId === right.sessionUserId &&
    left.accessToken === right.accessToken
  );
}

const UpdateStatusButton: React.FC<UpdateStatusButtonProps> = ({
  job,
  onStatusUpdated,
  variant = "outline",
  size = "sm",
  className = "",
  buttonText = "Update Status",
  onClick,
  propertyContextKey = null,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<JobStatus>(
    job.status as JobStatus,
  );
  const { toast } = useToast();
  const { data: session, status } = useSession();
  const isMountedRef = useRef(false);
  const isSubmittingRef = useRef(false);
  const currentMutationContextRef = useRef<MutationContext>({
    jobId: "",
    propertyContextKey: null,
    sessionUserId: "",
    accessToken: "",
  });
  const accessToken = session?.user?.accessToken ?? "";
  const sessionUserId = String(
    session?.currentUser?.user_id ?? session?.user?.id ?? "",
  );
  currentMutationContextRef.current = {
    jobId: String(job.job_id),
    propertyContextKey,
    sessionUserId,
    accessToken,
  };
  const currentStatusTone = normalizeStatus(job.status);
  const selectedStatusTone = normalizeStatus(selectedStatus);
  const isCompleted = currentStatusTone === JOB_STATUS.COMPLETED;

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (open) {
      // Reset the selected status to the current job status when opening
      setSelectedStatus(job.status as JobStatus);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isSubmittingRef.current) return;

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

    isSubmittingRef.current = true;
    setIsSubmitting(true);
    const mutationContext = currentMutationContextRef.current;
    try {
      if (!accessToken) {
        throw new Error("No access token available. Please log in again.");
      }

      const updatedJob = await updateJobStatus(
        String(job.job_id),
        selectedStatus,
        accessToken,
      );

      if (
        !isMountedRef.current ||
        !sameMutationContext(
          mutationContext,
          currentMutationContextRef.current,
        )
      ) {
        return;
      }

      onStatusUpdated(updatedJob);

      toast({
        title: "Status Updated",
        description: `Job #${updatedJob.job_id} status changed to ${updatedJob.status.replace("_", " ")}`,
      });

      setIsOpen(false);
    } catch (error) {
      console.error("Failed to update status:", error);
      if (
        isMountedRef.current &&
        sameMutationContext(
          mutationContext,
          currentMutationContextRef.current,
        )
      ) {
        toast({
          title: "Update Failed",
          description:
            error instanceof Error
              ? error.message
              : "Failed to update job status",
          variant: "destructive",
        });
      }
    } finally {
      isSubmittingRef.current = false;
      if (isMountedRef.current) {
        setIsSubmitting(false);
      }
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
          STATUS_BUTTON_CLASSES[currentStatusTone] ||
            "border-border bg-muted text-foreground hover:bg-muted",
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
                onValueChange={(value: JobStatus) => setSelectedStatus(value)}
                disabled={isSubmitting || isCompleted}
              >
                <SelectTrigger
                  id="status"
                  className={cn(
                    "border-2 text-sm font-bold",
                    STATUS_BUTTON_CLASSES[selectedStatusTone] ||
                      "border-border bg-card text-foreground",
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
                  STATUS_SUBMIT_CLASSES[selectedStatusTone],
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
