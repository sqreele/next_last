"use client";

import React, { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/app/components/ui/dialog";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Textarea } from "@/app/components/ui/textarea";
import { useSession } from "@/app/lib/session.client";
import { useAssigneeOptions } from "@/app/lib/hooks/useAssigneeOptions";
import { useUser } from "@/app/lib/stores/mainStore";
import {
  buildJobReassignPayload,
  toAssigneeOption,
  type AssigneeOption,
} from "@/app/lib/api/assignee-contracts";
import { fetchWithToken } from "@/app/lib/data.server";
import { Job } from "@/app/lib/types";
import { getDisplayName } from "@/app/lib/utils/display-name";
import { cn } from "@/app/lib/utils/cn";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === "development"
    ? "http://localhost:8000"
    : "https://hotelcarepro.com");

interface ReassignJobButtonProps {
  job: Job;
  onComplete?: () => void | Promise<void>;
  className?: string;
}

function propertyIdentifier(value: unknown): string | null {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  if (!value || typeof value !== "object") return null;
  const property = value as {
    property_id?: string | number;
    id?: string | number;
  };
  if (property.property_id != null) return String(property.property_id);
  if (property.id != null) return String(property.id);
  return null;
}

function deriveJobPropertyId(job: Job): string | null {
  const propertyIds = new Set<string>();
  const add = (value: unknown) => {
    const identifier = propertyIdentifier(value);
    if (identifier) propertyIds.add(identifier);
  };

  (job.rooms || []).forEach((room) => {
    add((room as { property_id?: string | number | null }).property_id);
    (room.properties || []).forEach(add);
  });
  add(job.area?.property_id);

  return propertyIds.size === 1 ? Array.from(propertyIds)[0] : null;
}

export function ReassignJobButton({
  job,
  onComplete,
  className,
}: ReassignJobButtonProps) {
  const router = useRouter();
  const { data: session } = useSession();
  const { selectedPropertyId } = useUser();
  const { assignees, loading: usersLoading } = useAssigneeOptions();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<AssigneeOption | null>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const currentContextRef = useRef({
    jobId: String(job.job_id),
    propertyId: selectedPropertyId == null ? null : String(selectedPropertyId),
    sessionId: String(session?.user?.id || session?.user?.accessToken || ""),
  });
  currentContextRef.current = {
    jobId: String(job.job_id),
    propertyId: selectedPropertyId == null ? null : String(selectedPropertyId),
    sessionId: String(session?.user?.id || session?.user?.accessToken || ""),
  };

  // The Job's Room/Area location is authoritative. A missing or ambiguous
  // scope intentionally produces no candidates instead of a tenant-wide
  // fallback.
  const jobPropertyId = useMemo(() => deriveJobPropertyId(job), [job]);

  const scopedOptions = useMemo(() => {
    if (!jobPropertyId) return [];
    return assignees
      .filter((assignee) =>
        assignee.properties.some(
          (property) =>
            String(property.property_id) === jobPropertyId ||
            String(property.id) === jobPropertyId,
        ),
      )
      .map(toAssigneeOption);
  }, [assignees, jobPropertyId]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return scopedOptions.slice(0, 25);
    return scopedOptions
      .filter(({ assignee }) => {
        const haystack = [
          assignee.username,
          assignee.email,
          assignee.first_name,
          assignee.last_name,
          assignee.display_name,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(term);
      })
      .slice(0, 25);
  }, [search, scopedOptions]);

  const selectedIsAuthorized = Boolean(
    selected && scopedOptions.some((option) => option.value === selected.value),
  );

  const isCurrentRequestContext = (requestContext: {
    jobId: string;
    propertyId: string | null;
    sessionId: string;
  }) => {
    const current = currentContextRef.current;
    return (
      current.jobId === requestContext.jobId &&
      current.propertyId === requestContext.propertyId &&
      current.sessionId === requestContext.sessionId
    );
  };

  const currentAssignee =
    typeof job.user === "object" && job.user
      ? (job.user as { username?: string }).username
      : job.user_name || String(job.user || "Unassigned");

  const handleSubmit = async () => {
    if (submittingRef.current) return;
    setError(null);
    if (!jobPropertyId) {
      setError("This job's property scope is unavailable or ambiguous.");
      return;
    }
    if (!selected || !selectedIsAuthorized) {
      setError("Pick a teammate to assign this job to.");
      return;
    }
    const token = session?.user?.accessToken;
    if (!token) {
      setError("Session expired — please sign in again.");
      return;
    }
    const requestContext = { ...currentContextRef.current };
    submittingRef.current = true;
    setSubmitting(true);
    try {
      await fetchWithToken(
        `${API_BASE_URL}/api/v1/jobs/${job.job_id}/reassign/`,
        token,
        "POST",
        buildJobReassignPayload(selected.assignee, note),
        0,
      );
      if (!isCurrentRequestContext(requestContext)) return;
      if (onComplete) {
        await onComplete();
      } else {
        router.refresh();
      }
      if (!isCurrentRequestContext(requestContext)) return;
      setOpen(false);
      setSelected(null);
      setNote("");
    } catch (caught: unknown) {
      if (isCurrentRequestContext(requestContext)) {
        setError(
          caught instanceof Error
            ? caught.message
            : "Could not reassign the job.",
        );
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (submittingRef.current) return;
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
          <DialogDescription className="text-xs font-medium text-muted-foreground">
            #{job.job_id} · currently {currentAssignee}
          </DialogDescription>
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
              disabled={submitting || !jobPropertyId}
            />
          </div>

          <div className="max-h-[40vh] space-y-1.5 overflow-y-auto rounded-xl border-2 border-border bg-card p-1">
            {!jobPropertyId ? (
              <p className="px-3 py-6 text-center text-sm font-semibold text-rose-700">
                This job&apos;s property scope is unavailable or ambiguous.
              </p>
            ) : usersLoading && !assignees.length ? (
              <div className="flex items-center gap-2 px-3 py-6 text-sm font-medium text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading
                teammates...
              </div>
            ) : filtered.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm font-medium text-muted-foreground">
                No teammates match. Try a different search.
              </p>
            ) : (
              filtered.map((option) => {
                const { assignee } = option;
                const active = selected?.value === option.value;
                const displayName = getDisplayName(assignee, option.label);
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setSelected(option)}
                    aria-pressed={active}
                    disabled={submitting}
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
                        {assignee.positions ||
                          assignee.email ||
                          `User #${assignee.user_id}`}
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
              disabled={submitting || !jobPropertyId}
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
            disabled={submitting || !jobPropertyId || !selectedIsAuthorized}
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
