"use client";

import React, { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Job } from "@/app/lib/types";

export default function EditJobPage() {
  const router = useRouter();
  const params = useParams();
  const jobId = params?.jobId as string;

  const [job, setJob] = useState<Job | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Simple job loading without complex hooks
  useEffect(() => {
    if (!jobId) return;

    const loadJob = async () => {
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
        setIsLoading(false);
      }
    };

    loadJob();
  }, [jobId]);

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
      const res = await fetch(`/api/jobs/${jobId}`, {
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

  if (!job) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <p className="text-gray-600">No job data available</p>
        </div>
      </div>
    );
  }

  // Simple inline form instead of complex dialog component
  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6">
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">
            Edit Job #{job.job_id}
          </h1>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Description Field */}
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              id="description"
              name="description"
              defaultValue={job.description}
              className="w-full p-3 border border-gray-300 rounded-md min-h-[100px]"
              required
              disabled={isSubmitting}
            />
          </div>

          {/* Status Field */}
          <div>
            <label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-1">
              Status
            </label>
            <select
              id="status"
              name="status"
              defaultValue={job.status}
              className="w-full p-3 border border-gray-300 rounded-md"
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
            <label htmlFor="priority" className="block text-sm font-medium text-gray-700 mb-1">
              Priority
            </label>
            <select
              id="priority"
              name="priority"
              defaultValue={job.priority}
              className="w-full p-3 border border-gray-300 rounded-md"
              disabled={isSubmitting}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>

          {/* Remarks Field */}
          <div>
            <label htmlFor="remarks" className="block text-sm font-medium text-gray-700 mb-1">
              Remarks
            </label>
            <textarea
              id="remarks"
              name="remarks"
              defaultValue={job.remarks || ""}
              className="w-full p-3 border border-gray-300 rounded-md min-h-[80px]"
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
              <span className="text-sm text-gray-700">Is Defective</span>
            </label>
            
            <label className="flex items-center">
              <input
                type="checkbox"
                name="is_preventivemaintenance"
                defaultChecked={job.is_preventivemaintenance}
                className="mr-2"
                disabled={isSubmitting}
              />
              <span className="text-sm text-gray-700">Is Preventive Maintenance</span>
            </label>
          </div>

          {/* Submit Button */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
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