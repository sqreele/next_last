"use client";

import React, { useMemo, useState } from "react";
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
import {
  useDetailedUsers,
  type DetailedUser,
} from "@/app/lib/hooks/useDetailedUsers";
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
  onComplete?: () => void;
  className?: string;
}

export function ReassignJobButton({
  job,
  onComplete,
  className,
}: ReassignJobButtonProps) {
  const { data: session } = useSession();
  const { users, loading: usersLoading } = useDetailedUsers();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<DetailedUser | null>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Limit choices to users that share at least one of the job's properties
  // when we can determine them — falls through to the full list when the
  // job's property data is opaque so the dispatcher isn't blocked.
  const jobPropertyIds = useMemo(() => {
    const ids = new Set<string>();
    const addProperty = (value: unknown) => {
      if (value === null || value === undefined) return;
      if (typeof value === "string" || typeof value === "number") {
        ids.add(String(value));
        return;
      }
      if (typeof value === "object") {
        const obj = value as {
          property_id?: string | number;
          id?: string | number;
        };
        if (obj.property_id != null) ids.add(String(obj.property_id));
        if (obj.id != null) ids.add(String(obj.id));
      }
    };
    if (job.property_id != null) ids.add(String(job.property_id));
    (job.properties || []).forEach(addProperty);
    (job.rooms || []).forEach((room) =>
      (room as { properties?: unknown[] }).properties?.forEach(addProperty),
    );
    return ids;
  }, [job]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const scope = jobPropertyIds.size
      ? users.filter((user) =>
          (user.properties || []).some(
            (p) =>
              jobPropertyIds.has(String(p.property_id)) ||
              jobPropertyIds.has(String((p as { id?: string }).id)),
          ),
        )
      : users;
    const list = scope.length ? scope : users;
    if (!term) return list.slice(0, 25);
    return list
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
  }, [search, users, jobPropertyIds]);

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
    setSubmitting(true);
    try {
      await fetchWithToken(
        `${API_BASE_URL}/api/v1/jobs/${job.job_id}/reassign/`,
        token,
        "POST",
        {
          user_id: selected.id,
          note: note.trim() || undefined,
        },
      );
      setOpen(false);
      setSelected(null);
      setNote("");
      onComplete?.();
    } catch (err: any) {
      setError(err?.message || "Could not reassign the job.");
    } finally {
      setSubmitting(false);
    }
  };

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
            {usersLoading && !users.length ? (
              <div className="flex items-center gap-2 px-3 py-6 text-sm font-medium text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading
                teammates...
              </div>
            ) : filtered.length === 0 ? (
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
                        {user.positions || user.email || `User #${user.id}`}
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
