"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import type { DemoJob, DemoSnapshot, DemoStatus } from "./types";
import { useDemoLanguage } from "./DemoLanguageProvider";

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

async function responseJson(response: Response, fallback: string) {
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.detail || fallback);
  return payload;
}

export function DemoProvider({ children }: { children: React.ReactNode }) {
  const { text } = useDemoLanguage();
  const [snapshot, setSnapshot] = useState<DemoSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/demo/", { cache: "no-store" });
      setSnapshot(await responseJson(response, text("บริการ Demo ไม่พร้อมใช้งาน", "Demo service is unavailable")));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : text("ไม่สามารถโหลดข้อมูล Demo ได้", "Unable to load demo data"));
    } finally {
      setLoading(false);
    }
  }, [text]);

  useEffect(() => { void refresh(); }, [refresh]);

  const createJob = useCallback(async (body: FormData) => {
    const job = await responseJson(await fetch("/api/demo/", { method: "POST", body }), text("ไม่สามารถสร้างงานได้", "Unable to create job")) as DemoJob;
    setSnapshot((current) => current ? { ...current, jobs: [job, ...current.jobs] } : current);
    return job;
  }, [text]);

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
    const job = await responseJson(await fetch(`/api/demo/${encodeURIComponent(jobId)}/`, { method: "PATCH", headers, body }), text("ไม่สามารถอัปเดตงานได้", "Unable to update job")) as DemoJob;
    setSnapshot((current) => current ? { ...current, jobs: current.jobs.map((item) => item.id === job.id ? job : item) } : current);
    return job;
  }, [text]);

  const addComment = useCallback(async (jobId: string, comment: string) => {
    const job = await responseJson(await fetch(`/api/demo/${encodeURIComponent(jobId)}/comments/`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ comment }),
    }), text("ไม่สามารถเพิ่มความคิดเห็นได้", "Unable to add comment")) as DemoJob;
    setSnapshot((current) => current ? { ...current, jobs: current.jobs.map((item) => item.id === job.id ? job : item) } : current);
    return job;
  }, [text]);

  const reset = useCallback(async () => {
    const response = await fetch("/api/demo/reset/", { method: "POST" });
    setSnapshot(await responseJson(response, text("ไม่สามารถรีเซ็ต Demo ได้", "Unable to reset Demo")));
  }, [text]);

  const value = useMemo(() => ({ snapshot, loading, error, refresh, createJob, updateStatus, addComment, reset }), [snapshot, loading, error, refresh, createJob, updateStatus, addComment, reset]);
  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

export function useDemo() {
  const context = useContext(DemoContext);
  if (!context) throw new Error("useDemo must be used inside DemoProvider");
  return context;
}
