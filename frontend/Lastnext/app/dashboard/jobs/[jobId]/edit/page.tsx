"use client";

import React, { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { Loader } from "lucide-react";
import { Job } from "@/app/lib/types";
import FileUpload from "@/app/components/jobs/FileUpload";
import Image from "next/image";
import { useMinLoaderTime } from "@/app/lib/hooks/useMinLoaderTime";

export default function EditJobPage() {
  const router = useRouter();
  const params = useParams();
  const jobId = params?.jobId as string;

  const [job, setJob] = useState<Job | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  const { recordLoaderShown, clearLoadingAfterMinTime } =
    useMinLoaderTime(setIsLoading);

  // Simple job loading without complex hooks
  useEffect(() => {
    if (!jobId) return;

    const loadJob = async () => {
      recordLoaderShown();
      setIsLoading(true);
      setError(null);

      try {
        const res = await fetch(`/api/jobs/${jobId}`);

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error || `Failed to load job (${res.status})`);
        }

        const data: Job = await res.json();
        setJob(data);
      } catch (e: any) {
        setError(e?.message || "Failed to load job");
      } finally {
        clearLoadingAfterMinTime();
      }
    };

    loadJob();
  }, [jobId, recordLoaderShown, clearLoadingAfterMinTime]);

  const handleClose = () => {
    router.push(`/dashboard/jobs/${jobId}`);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!jobId) return;

    const formData = new FormData(event.currentTarget);
    const hasFiles = selectedFiles.length > 0;

    const payload: Partial<Job> = {
      description: String(formData.get("description") || ""),
      status: String(formData.get("status") || "pending") as Job["status"],
      priority: String(formData.get("priority") || "low") as Job["priority"],
      remarks: String(formData.get("remarks") || ""),
      is_defective: Boolean(formData.get("is_defective")),
      is_preventivemaintenance: Boolean(
        formData.get("is_preventivemaintenance"),
      ),
    };

    setIsSubmitting(true);
    setError(null);

    try {
      let res: Response;
      if (hasFiles) {
        const submitForm = new FormData();
        submitForm.append("description", payload.description || "");
        submitForm.append("status", payload.status || "pending");
        submitForm.append("priority", payload.priority || "low");
        if (payload.remarks) submitForm.append("remarks", payload.remarks);
        submitForm.append(
          "is_defective",
          payload.is_defective ? "true" : "false",
        );
        submitForm.append(
          "is_preventivemaintenance",
          payload.is_preventivemaintenance ? "true" : "false",
        );
        selectedFiles.forEach((file) => submitForm.append("images", file));

        res = await fetch(`/api/jobs/${jobId}`, {
          method: "PATCH",
          body: submitForm,
        });
      } else {
        res = await fetch(`/api/jobs/${jobId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });
      }

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
      <div
        className="flex min-h-[60vh] flex-col items-center justify-center gap-5"
        aria-live="polite"
        aria-busy="true"
        role="status"
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-100 shadow-inner">
          <Loader className="h-8 w-8 animate-spin text-blue-600" aria-hidden />
        </div>
        <p className="text-center text-lg font-medium text-muted-foreground sm:text-xl">
          Loading form, please wait…
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full max-w-none px-3 py-4 sm:px-6">
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-red-700 text-sm">
          {error}
        </div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <p className="text-muted-foreground">No job data available</p>
        </div>
      </div>
    );
  }

  // Simple inline form instead of complex dialog component
  return (
    <div className="relative w-full max-w-none px-3 py-4 sm:px-6 sm:py-6 lg:mx-auto lg:max-w-2xl">
      {/* Full-screen saving overlay */}
      {isSubmitting && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-card/90 backdrop-blur-sm"
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
          <p className="text-center text-lg font-medium text-muted-foreground sm:text-xl">
            Saving, please wait…
          </p>
        </div>
      )}
      <div className="rounded-xl border border-border bg-card p-4 shadow-soft sm:p-6">
        <div className="mb-6 flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-foreground">
            Edit Job #{job.job_id}
          </h1>
          <button
            onClick={handleClose}
            className="grid h-11 w-11 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-muted-foreground"
            aria-label="Close edit form"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Description Field */}
          <div>
            <label
              htmlFor="description"
              className="block text-sm font-medium text-muted-foreground mb-1"
            >
              Description
            </label>
            <textarea
              id="description"
              name="description"
              defaultValue={job.description}
              className="w-full p-3 border border-border rounded-md min-h-[100px]"
              required
              disabled={isSubmitting}
            />
          </div>

          {/* Images - existing */}
          {job.image_urls && job.image_urls.length > 0 && (
            <div>
              <h2 className="text-sm font-medium text-muted-foreground mb-2">
                Existing Images
              </h2>
              <div className="grid grid-cols-2 gap-3">
                {job.image_urls.map((url, index) => {
                  const imageUrl = (() => {
                    if (typeof url === "string" && url.startsWith("http"))
                      return url;
                    if (typeof url === "string" && url.startsWith("/media/"))
                      return url;
                    if (typeof url === "string") return `/media/${url}`;
                    return String(url);
                  })();
                  return (
                    <div
                      key={index}
                      className="relative w-full h-28 rounded-md border overflow-hidden"
                    >
                      <Image
                        src={imageUrl}
                        alt={`Existing job image ${index + 1}`}
                        fill
                        className="object-cover"
                        quality={75}
                        unoptimized={imageUrl.startsWith("http")}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Images - upload new */}
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-2">
              Add Images
            </label>
            <FileUpload
              onFileSelect={(files) => setSelectedFiles(files)}
              maxFiles={5}
              maxSize={5}
              disabled={isSubmitting}
            />
          </div>

          {/* Status Field */}
          <div>
            <label
              htmlFor="status"
              className="block text-sm font-medium text-muted-foreground mb-1"
            >
              Status
            </label>
            <select
              id="status"
              name="status"
              defaultValue={job.status}
              className="w-full p-3 border border-border rounded-md"
              disabled={isSubmitting}
            >
              <option value="pending">Pending</option>
              <option value="in_progress">In Progress</option>
              <option value="waiting_sparepart">Waiting for Spare Part</option>
              <option value="completed">Completed</option>
            </select>
          </div>

          {/* Priority Field */}
          <div>
            <label
              htmlFor="priority"
              className="block text-sm font-medium text-muted-foreground mb-1"
            >
              Priority
            </label>
            <select
              id="priority"
              name="priority"
              defaultValue={job.priority}
              className="w-full p-3 border border-border rounded-md"
              disabled={isSubmitting}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>

          {/* Remarks Field */}
          <div>
            <label
              htmlFor="remarks"
              className="block text-sm font-medium text-muted-foreground mb-1"
            >
              Remarks
            </label>
            <textarea
              id="remarks"
              name="remarks"
              defaultValue={job.remarks || ""}
              className="w-full p-3 border border-border rounded-md min-h-[80px]"
              disabled={isSubmitting}
            />
          </div>

          {/* Checkboxes */}
          <div className="space-y-2">
            <label className="flex items-center">
              <input
                type="checkbox"
                name="is_defective"
                defaultChecked={job.is_defective}
                className="mr-2"
                disabled={isSubmitting}
              />
              <span className="text-sm text-muted-foreground">
                Is Defective
              </span>
            </label>

            <label className="flex items-center">
              <input
                type="checkbox"
                name="is_preventivemaintenance"
                defaultChecked={job.is_preventivemaintenance}
                className="mr-2"
                disabled={isSubmitting}
              />
              <span className="text-sm text-muted-foreground">
                Is Preventive Maintenance
              </span>
            </label>
          </div>

          {/* Submit Button */}
          <div className="sticky bottom-[4.5rem] -mx-4 grid gap-2 border-t border-border bg-card px-4 py-3 sm:static sm:mx-0 sm:flex sm:border-t-0 sm:px-0 sm:py-4">
            <button
              type="button"
              onClick={handleClose}
              className="min-h-11 rounded-xl border border-border px-4 py-2 font-semibold text-muted-foreground hover:bg-muted sm:w-auto"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="min-h-11 rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-50 sm:w-auto"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
