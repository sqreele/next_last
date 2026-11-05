"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import type { DemoJob, DemoSnapshot, DemoStatus } from "./types";

type DemoContextValue = {
  snapshot: DemoSnapshot | null;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
  createJob: (body: FormData) => Promise<DemoJob>;
  updateStatus: (jobId: string, status: DemoStatus, afterImage?: File | null) => Promise<DemoJob>;
  addComment: (jobId: string, comment: string) => Promise<DemoJob>;
  reset: () => Promise<void>;
};

const DemoContext = createContext<DemoContextValue | null>(null);

async function responseJson(response: Response) {
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.detail || "Demo service is unavailable");
  return payload;
}

export function DemoProvider({ children }: { children: React.ReactNode }) {
  const [snapshot, setSnapshot] = useState<DemoSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/demo/", { cache: "no-store" });
      setSnapshot(await responseJson(response));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load demo data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const createJob = useCallback(async (body: FormData) => {
    const job = await responseJson(await fetch("/api/demo/", { method: "POST", body })) as DemoJob;
    setSnapshot((current) => current ? { ...current, jobs: [job, ...current.jobs] } : current);
    return job;
  }, []);

  const updateStatus = useCallback(async (jobId: string, status: DemoStatus, afterImage?: File | null) => {
    let body: BodyInit;
    let headers: HeadersInit | undefined;
    if (afterImage) {
      const form = new FormData();
      form.set("status", status);
      form.set("after_image", afterImage);
      body = form;
    } else {
      headers = { "content-type": "application/json" };
      body = JSON.stringify({ status });
    }
    const job = await responseJson(await fetch(`/api/demo/${encodeURIComponent(jobId)}/`, { method: "PATCH", headers, body })) as DemoJob;
    setSnapshot((current) => current ? { ...current, jobs: current.jobs.map((item) => item.id === job.id ? job : item) } : current);
    return job;
  }, []);

  const addComment = useCallback(async (jobId: string, comment: string) => {
    const job = await responseJson(await fetch(`/api/demo/${encodeURIComponent(jobId)}/comments/`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ comment }),
    })) as DemoJob;
    setSnapshot((current) => current ? { ...current, jobs: current.jobs.map((item) => item.id === job.id ? job : item) } : current);
    return job;
  }, []);

  const reset = useCallback(async () => {
    const response = await fetch("/api/demo/reset/", { method: "POST" });
    setSnapshot(await responseJson(response));
  }, []);

  const value = useMemo(() => ({ snapshot, loading, error, refresh, createJob, updateStatus, addComment, reset }), [snapshot, loading, error, refresh, createJob, updateStatus, addComment, reset]);
  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

export function useDemo() {
  const context = useContext(DemoContext);
  if (!context) throw new Error("useDemo must be used inside DemoProvider");
  return context;
}
