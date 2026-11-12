"use client";

import React from "react";
import Link from "next/link";
import { Button } from "@/app/components/ui/button";

import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";

import { formatAppDate } from '@/app/lib/date-time.mjs';
import { useAppTimeZone } from '@/app/lib/hooks/useAppTimeZone';

import { getReportUserLabel } from "@/app/lib/jobs-report-data";

import { StatusBadge } from "@/app/components/StatusBadge";
import { PriorityBadge } from "@/app/components/PriorityBadge";
import { getJobsReportDetailHref } from "@/app/lib/jobs-report.mjs";

import type { JobsReportModel } from "./useJobsReportModel";

type Props = Pick<
  JobsReportModel,
  "filteredReportJobs"
  | "currentPage"
  | "pageSize"
  | "visibleReportJobs"
  | "paginatedReportJobs"
  | "selectedProperty"
  | "session"
  | "totalPages"
  | "setCurrentPage"
>;

export function JobsReportRows({
  filteredReportJobs,
  currentPage,
  pageSize,
  visibleReportJobs,
  paginatedReportJobs,
  selectedProperty,
  session,
  totalPages,
  setCurrentPage,
}: Props) {
  const appTimeZone = useAppTimeZone();
  return (<>
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <CardTitle className="text-base">Filtered job rows</CardTitle>
            <p className="text-sm font-normal text-muted-foreground">
              CSV exports all {filteredReportJobs.length} matching rows, not only this page.
            </p>
          </div>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {filteredReportJobs.length
              ? `Showing ${(currentPage - 1) * pageSize + 1}-${Math.min(
                  currentPage * pageSize,
                  filteredReportJobs.length,
                )} of ${filteredReportJobs.length}`
              : "0 matching jobs"}
          </p>
        </div>
      </CardHeader>
      <CardContent>
        {visibleReportJobs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
            <p className="font-semibold text-foreground">No jobs in this Property</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Jobs created for this Property will appear in the report.
            </p>
          </div>
        ) : filteredReportJobs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
            <p className="font-semibold text-foreground">
              No jobs match the selected report filters
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Clear or adjust filters to see report rows.
            </p>
          </div>
        ) : (
          <>
            <ol className="space-y-3 md:hidden" aria-label="Filtered job rows">
              {paginatedReportJobs.map((job) => {
                const detailHref = getJobsReportDetailHref(
                  job.job_id,
                  selectedProperty,
                );
                const location =
                  job.rooms?.map((room) => room.name).filter(Boolean).join(", ") ||
                  job.area?.name ||
                  job.area_name ||
                  "No location";
                return (
                  <li key={job.job_id} className="rounded-xl border border-border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="break-all text-sm font-bold text-foreground">
                          #{job.job_id}
                        </p>
                        <p className="mt-1 line-clamp-2 text-sm text-foreground/80">
                          {job.description || job.topics?.[0]?.title || "Untitled job"}
                        </p>
                      </div>
                      <StatusBadge className="shrink-0" size="sm" status={job.status} />
                    </div>
                    <dl className="mt-3 grid gap-2 text-sm text-muted-foreground">
                      <div className="flex justify-between gap-3">
                        <dt>Priority</dt>
                        <dd><PriorityBadge size="sm" priority={job.priority} /></dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt>Location</dt>
                        <dd className="min-w-0 break-words text-right text-foreground">{location}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt>Assigned to</dt>
                        <dd className="min-w-0 break-words text-right text-foreground">
                          {getReportUserLabel(job.user, session?.user)}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt>Created</dt>
                        <dd className="text-right text-foreground">
                          {formatAppDate(job.created_at, "en-US", { dateStyle: "medium", timeZone: appTimeZone })}
                        </dd>
                      </div>
                    </dl>
                    {detailHref ? (
                      <Link
                        href={detailHref}
                        className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-border px-3 text-sm font-semibold text-foreground hover:bg-muted focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        View job detail
                      </Link>
                    ) : null}
                  </li>
                );
              })}
            </ol>

            <div className="hidden overflow-x-auto rounded-xl border border-border md:block">
              <table className="w-full min-w-[900px] border-collapse text-left text-sm">
                <thead className="sticky top-0 bg-muted/90 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-3 py-3">Job ID</th>
                    <th scope="col" className="px-3 py-3">Created</th>
                    <th scope="col" className="px-3 py-3">Status</th>
                    <th scope="col" className="px-3 py-3">Priority</th>
                    <th scope="col" className="px-3 py-3">Description</th>
                    <th scope="col" className="px-3 py-3">Location</th>
                    <th scope="col" className="px-3 py-3">Assigned to</th>
                    <th scope="col" className="px-3 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {paginatedReportJobs.map((job) => {
                    const detailHref = getJobsReportDetailHref(job.job_id, selectedProperty);
                    const location =
                      job.rooms?.map((room) => room.name).filter(Boolean).join(", ") ||
                      job.area?.name ||
                      job.area_name ||
                      "—";
                    return (
                      <tr key={job.job_id} className="align-top hover:bg-muted/40">
                        <td className="whitespace-nowrap px-3 py-3 font-semibold">#{job.job_id}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-muted-foreground">
                          {formatAppDate(job.created_at, "en-US", { dateStyle: "medium", timeZone: appTimeZone })}
                        </td>
                        <td className="px-3 py-3">
                          <StatusBadge size="sm" status={job.status} />
                        </td>
                        <td className="px-3 py-3"><PriorityBadge size="sm" priority={job.priority} /></td>
                        <td className="max-w-xs px-3 py-3">
                          <span className="line-clamp-2" title={job.description || ""}>
                            {job.description || job.topics?.[0]?.title || "Untitled job"}
                          </span>
                        </td>
                        <td className="max-w-48 break-words px-3 py-3">{location}</td>
                        <td className="max-w-48 break-words px-3 py-3">
                          {getReportUserLabel(job.user, session?.user)}
                        </td>
                        <td className="px-3 py-3 text-right">
                          {detailHref ? (
                            <Link
                              href={detailHref}
                              className="inline-flex min-h-9 items-center rounded-md px-3 font-semibold text-primary hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              View
                            </Link>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {totalPages > 1 ? (
              <nav
                className="mt-4 flex flex-col items-center justify-between gap-3 sm:flex-row"
                aria-label="Jobs Report pages"
              >
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 w-full sm:w-auto"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                >
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 w-full sm:w-auto"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                >
                  Next
                </Button>
              </nav>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>

  </>);
}
