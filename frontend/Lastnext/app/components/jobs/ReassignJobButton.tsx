"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/app/components/ui/dialog";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Textarea } from "@/app/components/ui/textarea";
import { useSession } from "@/app/lib/session.client";
import { fetchWithToken } from "@/app/lib/data.server";
import { Job } from "@/app/lib/types";
import { getDisplayName } from "@/app/lib/utils/display-name";
import { cn } from "@/app/lib/utils/cn";
import { logger } from "@/app/lib/utils/logger";
import { useMainStore } from "@/app/lib/stores/mainStore";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === "development"
    ? "http://localhost:8000"
    : "https://hotelcarepro.com");

interface ReassignJobButtonProps {
  job: Job;
  onComplete?: () => void;
  className?: string;
}

interface AssignmentCandidate {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  display_name: string;
}

type CandidateStatus = "idle" | "loading" | "ready" | "unavailable" | "error";

export function ReassignJobButton({
  job,
  onComplete,
  className,
}: ReassignJobButtonProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const selectedPropertyId = useMainStore((state) => state.selectedPropertyId);
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<AssignmentCandidate[]>([]);
  const [candidateStatus, setCandidateStatus] = useState<CandidateStatus>("idle");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<AssignmentCandidate | null>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const candidateRequestId = useRef(0);

  const jobPropertyId = job.property_id == null ? null : String(job.property_id);
  const propertyMatches = Boolean(
    selectedPropertyId && jobPropertyId && selectedPropertyId === jobPropertyId,
  );
  const canAssign = job.can_assign === true;

  useEffect(() => {
    const requestId = ++candidateRequestId.current;
    const controller = new AbortController();
    setUsers([]);
    setSelected(null);

    if (!open || !canAssign || !propertyMatches || !selectedPropertyId) {
      setCandidateStatus("idle");
      return () => controller.abort();
    }

    setCandidateStatus("loading");
    setError(null);
    const url =
      `/api/jobs/${encodeURIComponent(job.job_id)}/assignment-candidates/` +
      `?property_id=${encodeURIComponent(selectedPropertyId)}`;

    void fetch(url, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (response.status === 401 || response.status === 403) {
          if (requestId === candidateRequestId.current && !controller.signal.aborted) {
            setCandidateStatus("unavailable");
          }
          return;
        }
        if (!response.ok) {
          throw new Error(
            `Failed to load assignment candidates: ${response.status} ${response.statusText}`,
          );
        }
        const data: unknown = await response.json();
        if (!Array.isArray(data)) {
          throw new Error("Assignment candidates response is not an array.");
        }
        if (
          requestId !== candidateRequestId.current ||
          controller.signal.aborted ||
          useMainStore.getState().selectedPropertyId !== selectedPropertyId
        ) {
          return;
        }
        setUsers(data as AssignmentCandidate[]);
        setCandidateStatus("ready");
      })
      .catch((requestError: unknown) => {
        if (
          controller.signal.aborted ||
          (requestError instanceof Error && requestError.name === "AbortError") ||
          requestId !== candidateRequestId.current
        ) {
          return;
        }
        logger.error("Error fetching job assignment candidates", requestError);
        setCandidateStatus("error");
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Could not load assignment candidates.",
        );
      });

    return () => controller.abort();
  }, [canAssign, job.job_id, open, propertyMatches, selectedPropertyId]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return users.slice(0, 25);
    return users
      .filter((user) => {
        const haystack = [
          user.username,
          user.email,
          user.first_name,
          user.last_name,
          user.full_name,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(term);
      })
      .slice(0, 25);
  }, [search, users]);

  const currentAssignee =
    typeof job.user === "object" && job.user
      ? (job.user as { username?: string }).username
      : job.user_name || String(job.user || "Unassigned");

  const handleSubmit = async () => {
    setError(null);
    if (!selected) {
      setError("Pick a teammate to assign this job to.");
      return;
    }
    const token = session?.user?.accessToken;
    if (!token) {
      setError("Session expired — please sign in again.");
      return;
    }
    if (
      !selectedPropertyId ||
      selectedPropertyId !== jobPropertyId ||
      useMainStore.getState().selectedPropertyId !== selectedPropertyId
    ) {
      setError("The active property changed. Reopen this job from the active property.");
      return;
    }
    setSubmitting(true);
    try {
      await fetchWithToken(
        `${API_BASE_URL}/api/v1/jobs/${job.job_id}/reassign/`,
        token,
        "POST",
        {
          user_id: selected.id,
          property_id: selectedPropertyId,
          note: note.trim() || undefined,
        },
      );
      setOpen(false);
      setSelected(null);
      setNote("");
      onComplete?.();
      router.refresh();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Could not reassign the job.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (!canAssign || !propertyMatches) {
    return null;
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setSelected(null);
          setNote("");
          setError(null);
          setSearch("");
        }
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className={cn("h-10", className)}
          aria-label="Reassign this job"
        >
          <UserPlus className="mr-2 h-4 w-4" />
          Reassign
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] w-[calc(100vw-1.5rem)] overflow-y-auto rounded-xl bg-card p-0 sm:max-w-md">
        <DialogHeader className="border-b border-border px-5 py-4 text-left">
          <DialogTitle className="text-lg font-bold text-foreground">
            Reassign job
          </DialogTitle>
          <p className="text-xs font-medium text-muted-foreground">
            #{job.job_id} · currently {currentAssignee}
          </p>
        </DialogHeader>

        <div className="space-y-4 px-5 py-4">
          <div className="space-y-1.5">
            <label
              htmlFor="reassign-search"
              className="text-sm font-bold text-foreground"
            >
              Search teammate
            </label>
            <Input
              id="reassign-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Name, username, or email"
              className="h-11 border-2 border-border text-sm"
              autoFocus
            />
          </div>

          <div className="max-h-[40vh] space-y-1.5 overflow-y-auto rounded-xl border-2 border-border bg-card p-1">
            {candidateStatus === "loading" ? (
              <div className="flex items-center gap-2 px-3 py-6 text-sm font-medium text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading
                teammates...
              </div>
            ) : candidateStatus === "unavailable" ? (
              <p className="px-3 py-6 text-center text-sm font-semibold text-amber-700">
                Assignment candidates are unavailable for your role or active property.
              </p>
            ) : candidateStatus === "error" ? (
              <p className="px-3 py-6 text-center text-sm font-semibold text-rose-700">
                Could not load assignment candidates. Try again later.
              </p>
            ) : candidateStatus === "ready" && filtered.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm font-medium text-muted-foreground">
                No teammates match. Try a different search.
              </p>
            ) : (
              filtered.map((user) => {
                const active = selected?.id === user.id;
                const displayName = getDisplayName(
                  user,
                  user.username || user.email,
                );
                return (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => setSelected(user)}
                    aria-pressed={active}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors touch-manipulation",
                      active
                        ? "bg-blue-50 ring-2 ring-blue-500"
                        : "hover:bg-muted",
                    )}
                  >
                    <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-slate-200 text-xs font-bold text-muted-foreground">
                      {(displayName || "?").slice(0, 2).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-foreground line-clamp-1">
                        {displayName}
                      </p>
                      <p className="text-xs font-medium text-muted-foreground line-clamp-1">
                        {user.email || user.display_name || `User #${user.id}`}
                      </p>
                    </div>
                    {active && (
                      <CheckCircle2
                        className="h-4 w-4 flex-none text-blue-600"
                        aria-hidden="true"
                      />
                    )}
                  </button>
                );
              })
            )}
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="reassign-note"
              className="text-sm font-bold text-foreground"
            >
              Note{" "}
              <span className="text-xs font-medium text-muted-foreground">
                (optional)
              </span>
            </label>
            <Textarea
              id="reassign-note"
              value={note}
              onChange={(event) => setNote(event.target.value.slice(0, 300))}
              placeholder="Why are we moving this? Anything they should know?"
              className="min-h-[72px] border-2 border-border text-sm"
            />
            <p className="text-right text-[11px] font-medium text-muted-foreground">
              {note.length}/300
            </p>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-none" />
              {error}
            </div>
          )}
        </div>

        <DialogFooter className="sticky bottom-0 flex-col gap-2 border-t border-border bg-card px-5 py-3 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={submitting}
            className="h-11 w-full sm:w-auto"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !selected}
            className="h-11 w-full bg-blue-600 font-bold text-white hover:bg-blue-700 disabled:bg-slate-300 sm:w-auto"
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Reassigning...
              </>
            ) : (
              "Reassign"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
