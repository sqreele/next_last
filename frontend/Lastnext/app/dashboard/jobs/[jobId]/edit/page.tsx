"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import EditJobDialog from "@/app/components/jobs/EditJobDialog";
import { Job } from "@/app/lib/types";

export default function EditJobPage() {
  const router = useRouter();
  const params = useParams();
  const jobId = params?.jobId as string;

  const [job, setJob] = useState<Job | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const loadJob = useCallback(async () => {
    if (!jobId) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/app/api/jobs/${jobId}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Failed to load job (${res.status})`);
      }
      const data: Job = await res.json();
      setJob(data);
    } catch (e: any) {
      setError(e?.message || "Failed to load job");
    } finally {
      setIsLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    loadJob();
  }, [loadJob]);

  const handleClose = () => {
    router.push(`/dashboard/jobs/${jobId}`);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!jobId) return;

    const formData = new FormData(event.currentTarget);
    const payload: Partial<Job> = {
      description: String(formData.get("description") || ""),
      status: String(formData.get("status") || "pending") as Job["status"],
      priority: String(formData.get("priority") || "low") as Job["priority"],
      remarks: String(formData.get("remarks") || ""),
      is_defective: Boolean(formData.get("is_defective")),
      is_preventivemaintenance: Boolean(formData.get("is_preventivemaintenance")),
    };

    setIsSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/app/api/jobs/${jobId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Failed to update job (${res.status})`);
      }
      // On success, navigate back to job details
      router.push(`/dashboard/jobs/${jobId}`);
    } catch (e: any) {
      setError(e?.message || "Failed to update job");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-md mx-auto p-4">
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-red-700 text-sm">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="p-2">
      <EditJobDialog
        isOpen={true}
        onClose={handleClose}
        job={job}
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting}
      />
    </div>
  );
}