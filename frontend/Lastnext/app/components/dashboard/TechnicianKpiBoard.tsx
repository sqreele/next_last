"use client";

import React, { useMemo, useState } from "react";
import {
  Users,
  CheckCircle2,
  Hammer,
  Clock,
  AlertTriangle,
  TrendingUp,
  ArrowUpDown,
} from "lucide-react";
import { Job } from "@/app/lib/types";
import { getDisplayName } from "@/app/lib/utils/display-name";
import { cn } from "@/app/lib/utils/cn";
import { normalizeStatus } from "@/app/components/pcms-ui";

interface TechnicianKpiBoardProps {
  jobs: Job[];
  /** Window in days for the "this week" / "last week" comparison. */
  windowDays?: number;
  className?: string;
}

type SortKey = "assigned" | "completed" | "rate" | "avgResponseHours";
type SortDir = "desc" | "asc";

interface Row {
  key: string;
  name: string;
  assigned: number;
  inProgress: number;
  completed: number;
  overdue: number;
  rate: number; // percent
  avgResponseHours: number | null;
  thisWeekCompleted: number;
  lastWeekCompleted: number;
}

function ageInHours(a: string, b?: string | null): number | null {
  if (!b) return null;
  const start = new Date(a).getTime();
  const end = new Date(b).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  return Math.max(0, (end - start) / 3_600_000);
}

function jobKey(job: Job): string {
  if (typeof job.user === "object" && job.user) {
    const obj = job.user as { id?: string | number; username?: string };
    if (obj.id != null) return `id:${obj.id}`;
    if (obj.username) return `un:${obj.username}`;
  }
  return `raw:${String(job.user ?? "unassigned")}`;
}

export function TechnicianKpiBoard({
  jobs,
  windowDays = 7,
  className,
}: TechnicianKpiBoardProps) {
  const [sortKey, setSortKey] = useState<SortKey>("assigned");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const rows = useMemo<Row[]>(() => {
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const thisStart = now - windowDays * dayMs;
    const priorStart = now - 2 * windowDays * dayMs;
    const buckets = new Map<string, Row & { responseSamples: number[] }>();

    for (const job of jobs) {
      const key = jobKey(job);
      const created = new Date(job.created_at).getTime();
      const overdue =
        !job.completed_at &&
        !Number.isNaN(created) &&
        (now - created) / dayMs >= 3 &&
        !["completed", "cancelled"].includes(normalizeStatus(job.status));

      let row = buckets.get(key);
      if (!row) {
        const display = getDisplayName(
          job.user,
          job.technician_name || job.user_name || "Unassigned",
        );
        row = {
          key,
          name: display,
          assigned: 0,
          inProgress: 0,
          completed: 0,
          overdue: 0,
          rate: 0,
          avgResponseHours: null,
          thisWeekCompleted: 0,
          lastWeekCompleted: 0,
          responseSamples: [],
        };
        buckets.set(key, row);
      }

      row.assigned += 1;
      const status = normalizeStatus(job.status);
      if (status === "in_progress") row.inProgress += 1;
      if (status === "completed" || status === "verified") {
        row.completed += 1;
        const hours = ageInHours(job.created_at, job.completed_at);
        if (hours !== null) row.responseSamples.push(hours);
        if (job.completed_at) {
          const c = new Date(job.completed_at).getTime();
          if (!Number.isNaN(c)) {
            if (c >= thisStart) row.thisWeekCompleted += 1;
            else if (c >= priorStart) row.lastWeekCompleted += 1;
          }
        }
      }
      if (overdue) row.overdue += 1;
    }

    return Array.from(buckets.values()).map((row) => {
      const rate =
        row.assigned > 0 ? Math.round((row.completed / row.assigned) * 100) : 0;
      const avg = row.responseSamples.length
        ? row.responseSamples.reduce((sum, value) => sum + value, 0) /
          row.responseSamples.length
        : null;
      return {
        key: row.key,
        name: row.name,
        assigned: row.assigned,
        inProgress: row.inProgress,
        completed: row.completed,
        overdue: row.overdue,
        rate,
        avgResponseHours: avg,
        thisWeekCompleted: row.thisWeekCompleted,
        lastWeekCompleted: row.lastWeekCompleted,
      };
    });
  }, [jobs, windowDays]);

  const sorted = useMemo(() => {
    const direction = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = a[sortKey] ?? -1;
      const bv = b[sortKey] ?? -1;
      if (av === bv) return a.name.localeCompare(b.name);
      return (av < bv ? -1 : 1) * direction;
    });
  }, [rows, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  if (rows.length === 0) {
    return null;
  }

  const top = sorted[0];

  return (
    <section
      aria-label="Technician performance"
      className={cn(
        "rounded-xl border border-border bg-card p-4 shadow-soft sm:p-5",
        className,
      )}
    >
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-slate-900 text-white">
            <Users className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-base font-bold text-foreground sm:text-lg">
              Technician performance
            </h2>
            <p className="text-xs font-medium text-muted-foreground">
              {rows.length} technician{rows.length === 1 ? "" : "s"} · last{" "}
              {windowDays} days vs prior {windowDays}
            </p>
          </div>
        </div>
        {top && (
          <div className="hidden items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800 sm:inline-flex">
            <TrendingUp className="h-3 w-3" />
            Top by {sortKey}: {top.name}
          </div>
        )}
      </header>

      {/* Mobile: stacked cards */}
      <ul className="space-y-2 md:hidden">
        {sorted.map((row) => (
          <li
            key={row.key}
            className="rounded-xl border border-border bg-card p-3 shadow-soft"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-bold text-foreground line-clamp-1">
                  {row.name}
                </p>
                <p className="text-[11px] font-semibold text-muted-foreground">
                  {row.assigned} assigned · {row.completed} done · {row.overdue}{" "}
                  overdue
                </p>
              </div>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-bold",
                  row.rate >= 75
                    ? "bg-emerald-100 text-emerald-800"
                    : row.rate >= 50
                      ? "bg-amber-100 text-amber-900"
                      : "bg-rose-100 text-rose-800",
                )}
              >
                {row.rate}%
              </span>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-1 text-[11px] font-semibold text-muted-foreground">
              <span className="flex items-center gap-1">
                <Hammer className="h-3 w-3 text-amber-600" />
                {row.inProgress} active
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3 text-blue-600" />
                {row.avgResponseHours == null
                  ? "—"
                  : row.avgResponseHours < 24
                    ? `${Math.round(row.avgResponseHours)}h avg`
                    : `${Math.round(row.avgResponseHours / 24)}d avg`}
              </span>
              <span className="flex items-center gap-1">
                <TrendingUp className="h-3 w-3 text-emerald-600" />
                {row.thisWeekCompleted - row.lastWeekCompleted >= 0
                  ? `+${row.thisWeekCompleted - row.lastWeekCompleted}`
                  : row.thisWeekCompleted - row.lastWeekCompleted}{" "}
                wk
              </span>
            </div>
          </li>
        ))}
      </ul>

      {/* Desktop: sortable table */}
      <div className="hidden overflow-hidden rounded-xl border border-border md:block">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Technician</th>
              <HeaderCell
                label="Assigned"
                columnKey="assigned"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={toggleSort}
              />
              <HeaderCell
                label="Done"
                columnKey="completed"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={toggleSort}
              />
              <th className="px-3 py-2">Overdue</th>
              <HeaderCell
                label="Rate"
                columnKey="rate"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={toggleSort}
              />
              <HeaderCell
                label="Avg response"
                columnKey="avgResponseHours"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={toggleSort}
              />
              <th className="px-3 py-2">Δ vs prior</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sorted.map((row) => {
              const delta = row.thisWeekCompleted - row.lastWeekCompleted;
              return (
                <tr key={row.key} className="hover:bg-muted">
                  <td className="px-3 py-2 font-bold text-foreground">
                    {row.name}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {row.assigned}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                      {row.completed}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {row.overdue > 0 ? (
                      <span className="inline-flex items-center gap-1 text-rose-700">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        {row.overdue}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-bold",
                        row.rate >= 75
                          ? "bg-emerald-100 text-emerald-800"
                          : row.rate >= 50
                            ? "bg-amber-100 text-amber-900"
                            : "bg-rose-100 text-rose-800",
                      )}
                    >
                      {row.rate}%
                    </span>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {row.avgResponseHours == null
                      ? "—"
                      : row.avgResponseHours < 24
                        ? `${Math.round(row.avgResponseHours)}h`
                        : `${Math.round(row.avgResponseHours / 24)}d`}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold",
                        delta > 0
                          ? "bg-emerald-100 text-emerald-800"
                          : delta < 0
                            ? "bg-rose-100 text-rose-800"
                            : "bg-muted text-muted-foreground",
                      )}
                    >
                      <TrendingUp className="h-3 w-3" />
                      {delta > 0 ? `+${delta}` : delta}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

interface HeaderCellProps {
  label: string;
  /** Column this header sorts by. */
  columnKey: SortKey;
  /** Currently-active sort key (so the column knows when to highlight). */
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
}

function HeaderCell({
  label,
  columnKey,
  sortKey,
  sortDir,
  onSort,
}: HeaderCellProps) {
  const active = sortKey === columnKey;
  return (
    <th className="px-3 py-2">
      <button
        type="button"
        onClick={() => onSort(columnKey)}
        className={cn(
          "inline-flex items-center gap-1 font-bold uppercase tracking-wider",
          active
            ? "text-foreground"
            : "text-muted-foreground hover:text-muted-foreground",
        )}
      >
        {label}
        <ArrowUpDown className="h-3 w-3" aria-hidden="true" />
        {active && (
          <span className="text-[9px] font-bold">
            {sortDir === "asc" ? "↑" : "↓"}
          </span>
        )}
      </button>
    </th>
  );
}
