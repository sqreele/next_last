"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import { AlertCircle, Clock, Loader, MessageSquare, Send } from "lucide-react";
import { Textarea } from "@/app/components/ui/textarea";
import { Button } from "@/app/components/ui/button";
import { Alert, AlertDescription } from "@/app/components/ui/alert";
import { useToast } from "@/app/components/ui/use-toast";
import { useSession } from "@/app/lib/session.client";
import { enqueueRequest } from "@/app/lib/offline-queue";
import { useOfflineQueue } from "@/app/lib/hooks/useOfflineQueue";
import {
  appendAuthoritativeComment,
  buildJobCommentsUrl,
  canSubmitJobComment,
  getCommentsViewState,
  normalizeJobCommentsResponse,
} from "@/app/lib/job-comments.mjs";
import type { JobComment } from "@/app/lib/types";

type Props = {
  jobId: string;
  propertyId: string;
  canComment: boolean;
};

function formatTimestamp(value?: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as unknown;
    if (typeof data === "string") return data;
    if (data && typeof data === "object") {
      const responseData = data as {
        detail?: unknown;
        comment?: unknown;
      };
      if (responseData.detail) return String(responseData.detail);
      if (responseData.comment) {
        return Array.isArray(responseData.comment)
          ? responseData.comment.join(", ")
          : String(responseData.comment);
      }
    }
    return err.message || fallback;
  }
  if (err instanceof Error) return err.message || fallback;
  return fallback;
}

const JobCommentsSection: React.FC<Props> = ({
  jobId,
  propertyId,
  canComment,
}) => {
  const { toast } = useToast();
  const { data: session } = useSession();
  const { queue } = useOfflineQueue();
  const [comments, setComments] = useState<JobComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const commentsUrl = buildJobCommentsUrl({ jobId, propertyId });
  const queueEndpoint = buildJobCommentsUrl({
    jobId,
    propertyId,
    proxy: false,
  });
  const pendingComments = queue.filter(
    (item) =>
      item.kind === "job-comment-create" && item.endpoint === queueEndpoint,
  );

  const fetchComments = useCallback(
    async (signal?: AbortSignal) => {
      if (!commentsUrl) return;
      setLoading(true);
      setError(null);
      try {
        const res = await axios.get(commentsUrl, {
          withCredentials: true,
          signal,
        });
        setComments(normalizeJobCommentsResponse(res.data));
      } catch (err) {
        if (!axios.isCancel(err)) {
          setError(getErrorMessage(err, "Unable to load comments"));
        }
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [commentsUrl],
  );

  useEffect(() => {
    const controller = new AbortController();
    void fetchComments(controller.signal);
    return () => controller.abort();
  }, [fetchComments]);

  useEffect(() => {
    if (pendingComments.length === 0 && !loading) {
      fetchComments();
    }
    // We only want to refetch after queued comments drain.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingComments.length]);

  const appendPendingComment = (value: string) => {
    const now = new Date().toISOString();
    const pending: JobComment = {
      id: -Date.now(),
      job: Number(jobId) || 0,
      comment: value,
      author_id: null,
      author_username: session?.user?.username || null,
      author_name: session?.user?.first_name || session?.user?.email || "You",
      created_at: now,
      updated_at: now,
    };
    setComments((prev) => [...prev, pending]);
  };

  const queueComment = (value: string) => {
    if (!queueEndpoint) return;
    enqueueRequest({
      kind: "job-comment-create",
      label: `Comment on #${jobId}`,
      endpoint: queueEndpoint,
      method: "POST",
      body: { comment: value },
    });
    appendPendingComment(value);
    setText("");
    toast({
      title: "Comment queued",
      description: "It will sync when this device is back online.",
      variant: "success",
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current) return;
    const value = text.trim();
    if (!canSubmitJobComment({ text: value, submitting, canComment })) {
      if (submitting || !canComment) return;
      toast({ title: "Comment cannot be empty", variant: "destructive" });
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    try {
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        queueComment(value);
        return;
      }

      if (!commentsUrl) throw new Error("Active Property is required.");
      const res = await axios.post(
        commentsUrl,
        { comment: value },
        { withCredentials: true },
      );
      // Append the new comment optimistically (server returns full comment shape)
      if (res.data && res.data.id) {
        setComments((current) =>
          appendAuthoritativeComment(current, res.data as JobComment),
        );
      } else {
        fetchComments();
      }
      setText("");
      toast({ title: "Comment added", variant: "success" });
    } catch (err) {
      const statusCode = axios.isAxiosError(err)
        ? err.response?.status
        : undefined;
      const transient =
        !statusCode ||
        statusCode === 408 ||
        statusCode === 425 ||
        statusCode === 429 ||
        statusCode >= 500;
      if (transient) {
        queueComment(value);
        return;
      }
      toast({
        title: "Failed to add comment",
        description: getErrorMessage(err, "Please try again"),
        variant: "destructive",
      });
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const queuedOnlyComments = pendingComments.filter(
    (item) =>
      !comments.some(
        (comment) =>
          comment.id < 0 && comment.comment === String(item.body.comment || ""),
      ),
  );
  const visibleCommentCount = comments.length + queuedOnlyComments.length;
  const viewState = getCommentsViewState({
    loading,
    error,
    comments,
    pendingCount: queuedOnlyComments.length,
  });
  const submitEnabled = canSubmitJobComment({
    text,
    submitting,
    canComment,
  });

  return (
    <section
      className="pcms-section-card space-y-5 p-4 sm:p-6"
      aria-labelledby="job-comments-heading"
    >
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <MessageSquare className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2
            id="job-comments-heading"
            className="flex flex-wrap items-center gap-2 text-lg font-black text-[var(--pcms-text)]"
          >
            Comments
            {viewState === "ready" ? (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                {visibleCommentCount}
              </span>
            ) : null}
          </h2>
          <p className="text-sm text-muted-foreground">
            Updates and context shared by the job team.
          </p>
        </div>
      </div>

      {viewState === "error" ? (
        <Alert role="alert" className="border-red-200 bg-red-50">
          <AlertCircle className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-sm text-red-800">
            <span className="font-semibold">Unable to load comments.</span>{" "}
            {error}
          </AlertDescription>
        </Alert>
      ) : viewState === "loading" ? (
        <div
          className="flex min-h-20 items-center justify-center gap-2 rounded-xl border border-border bg-muted/30 text-sm text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          <Loader className="h-4 w-4 animate-spin" aria-hidden="true" />
          Loading comments…
        </div>
      ) : viewState === "empty" ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-6 text-center">
          <MessageSquare
            className="mx-auto h-6 w-6 text-muted-foreground"
            aria-hidden="true"
          />
          <p className="mt-2 text-sm font-semibold text-foreground">
            No comments yet
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Comments added to this job will appear here.
          </p>
        </div>
      ) : (
        <ol className="max-w-3xl space-y-3" aria-label="Comments on this job">
          {comments.map((c) => (
            <li
              key={c.id}
              className="rounded-xl border border-border bg-card p-4"
            >
              <div className="flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                <span className="text-sm font-semibold text-foreground">
                  {c.author_name || c.author_username || "Unknown"}
                </span>
                {c.id < 0 ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                    <Clock className="h-3 w-3" /> Pending sync
                  </span>
                ) : (
                  <time
                    className="text-xs text-muted-foreground"
                    dateTime={c.created_at}
                  >
                    {formatTimestamp(c.created_at)}
                  </time>
                )}
              </div>
              <p className="mt-2 whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-sm leading-6 text-foreground/80">
                {c.comment}
              </p>
            </li>
          ))}
          {queuedOnlyComments.map((item) => (
            <li
              key={item.id}
              className="rounded-xl border border-amber-200 bg-amber-50 p-4"
            >
              <div className="flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                <span className="text-sm font-semibold text-foreground">
                  You
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-card px-2 py-0.5 text-xs font-semibold text-amber-700">
                  <Clock className="h-3 w-3" /> Pending sync
                </span>
              </div>
              <p className="mt-2 whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-sm leading-6 text-foreground/80">
                {String(item.body.comment || "")}
              </p>
            </li>
          ))}
        </ol>
      )}

      {canComment ? (
        <form
          onSubmit={handleSubmit}
          className="space-y-3 border-t border-border pt-5"
        >
          <label
            htmlFor="job-comment-text"
            className="text-sm font-semibold text-foreground"
          >
            Add a comment
          </label>
          <Textarea
            id="job-comment-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Share an update or useful context…"
            rows={4}
            disabled={submitting}
            className="min-h-28 resize-y focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Button
            type="submit"
            disabled={!submitEnabled}
            className="min-h-11 w-full gap-2 sm:w-auto"
          >
            {submitting ? (
              <Loader className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Send className="h-4 w-4" aria-hidden="true" />
            )}
            {submitting ? "Adding comment…" : "Add Comment"}
          </Button>
        </form>
      ) : (
        <p className="border-t border-border pt-4 text-sm text-muted-foreground">
          You can read comments, but your role cannot add them.
        </p>
      )}
    </section>
  );
};

export default JobCommentsSection;
