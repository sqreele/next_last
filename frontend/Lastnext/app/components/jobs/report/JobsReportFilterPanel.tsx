"use client";

import React from "react";

import { Button } from "@/app/components/ui/button";

import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Search } from "lucide-react";

import { JobStatus, JobPriority } from "@/app/lib/types";

import { type PmFilterType, type TopicFilterValue, type UserFilterValue } from "@/app/lib/jobs-report-data";

import { STATUS_FILTER_OPTIONS, PRIORITY_FILTER_OPTIONS, PM_FILTER_OPTIONS } from "./jobs-report-config";
import type { JobsReportModel } from "./useJobsReportModel";

type Props = Pick<
  JobsReportModel,
  "searchFilter"
  | "setSearchFilter"
  | "statusFilter"
  | "setStatusFilter"
  | "priorityFilter"
  | "setPriorityFilter"
  | "pmFilter"
  | "setPmFilter"
  | "topicFilter"
  | "setTopicFilter"
  | "jobsWithNoTopicCount"
  | "topicFilterOptions"
  | "userFilter"
  | "setUserFilter"
  | "jobsWithNoUserCount"
  | "userFilterOptions"
  | "createdFrom"
  | "setCreatedFrom"
  | "createdTo"
  | "setCreatedTo"
  | "monthFilter"
  | "setMonthFilter"
  | "monthFilterOptions"
  | "yearFilter"
  | "setYearFilter"
  | "yearFilterOptions"
  | "setExportError"
  | "setCurrentPage"
  | "filteredReportJobs"
  | "visibleReportJobs"
  | "dateRangeInvalid"
>;

export function JobsReportFilterPanel({
  searchFilter,
  setSearchFilter,
  statusFilter,
  setStatusFilter,
  priorityFilter,
  setPriorityFilter,
  pmFilter,
  setPmFilter,
  topicFilter,
  setTopicFilter,
  jobsWithNoTopicCount,
  topicFilterOptions,
  userFilter,
  setUserFilter,
  jobsWithNoUserCount,
  userFilterOptions,
  createdFrom,
  setCreatedFrom,
  createdTo,
  setCreatedTo,
  monthFilter,
  setMonthFilter,
  monthFilterOptions,
  yearFilter,
  setYearFilter,
  yearFilterOptions,
  setExportError,
  setCurrentPage,
  filteredReportJobs,
  visibleReportJobs,
  dateRangeInvalid,
}: Props) {
  return (<>
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Report & export filters</CardTitle>
        <p className="text-sm font-normal text-muted-foreground">
          Narrow jobs before export. Charts and CSV only include rows that
          match all selected criteria (including topic and user).
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-4 [&_input]:min-h-11 [&_select]:min-h-11 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          <div className="space-y-1.5 sm:col-span-2">
            <label
              htmlFor="jobs-report-search"
              className="text-xs font-medium text-muted-foreground"
            >
              Search report
            </label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                id="jobs-report-search"
                type="search"
                value={searchFilter}
                onChange={(event) => setSearchFilter(event.target.value)}
                placeholder="Job ID, description, room, area, topic, or assignee"
                className="w-full rounded-md border border-border bg-card py-2 pl-9 pr-3 text-sm shadow-soft focus:border-blue-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor="jobs-report-status"
              className="text-xs font-medium text-muted-foreground"
            >
              Status
            </label>
            <select
              id="jobs-report-status"
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm shadow-soft focus:border-blue-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as JobStatus | "all")
              }
            >
              {STATUS_FILTER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor="jobs-report-priority"
              className="text-xs font-medium text-muted-foreground"
            >
              Priority
            </label>
            <select
              id="jobs-report-priority"
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm shadow-soft focus:border-blue-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
              value={priorityFilter}
              onChange={(e) =>
                setPriorityFilter(e.target.value as JobPriority | "all")
              }
            >
              {PRIORITY_FILTER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor="jobs-report-pm"
              className="text-xs font-medium text-muted-foreground"
            >
              Job type (PM)
            </label>
            <select
              id="jobs-report-pm"
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm shadow-soft focus:border-blue-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
              value={pmFilter}
              onChange={(e) => setPmFilter(e.target.value as PmFilterType)}
            >
              {PM_FILTER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor="jobs-report-topic"
              className="text-xs font-medium text-muted-foreground"
            >
              Topic
            </label>
            <select
              id="jobs-report-topic"
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm shadow-soft focus:border-blue-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
              value={topicFilter}
              onChange={(e) =>
                setTopicFilter(e.target.value as TopicFilterValue)
              }
            >
              <option value="all">All topics</option>
              {jobsWithNoTopicCount > 0 ? (
                <option value="none">
                  No topic ({jobsWithNoTopicCount})
                </option>
              ) : null}
              {topicFilterOptions.map((t) => (
                <option key={t.id} value={String(t.id)}>
                  {t.title}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor="jobs-report-user"
              className="text-xs font-medium text-muted-foreground"
            >
              User
            </label>
            <select
              id="jobs-report-user"
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm shadow-soft focus:border-blue-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
              value={userFilter}
              onChange={(e) =>
                setUserFilter(e.target.value as UserFilterValue)
              }
            >
              <option value="all">All users</option>
              {jobsWithNoUserCount > 0 ? (
                <option value="none">
                  No assignee ({jobsWithNoUserCount})
                </option>
              ) : null}
              {userFilterOptions.map((u) => (
                <option key={u.key} value={u.key}>
                  {u.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor="jobs-report-from"
              className="text-xs font-medium text-muted-foreground"
            >
              Created from
            </label>
            <input
              id="jobs-report-from"
              type="date"
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm shadow-soft focus:border-blue-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
              value={createdFrom}
              onChange={(e) => setCreatedFrom(e.target.value)}
              max={createdTo || undefined}
            />
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor="jobs-report-to"
              className="text-xs font-medium text-muted-foreground"
            >
              Created to
            </label>
            <input
              id="jobs-report-to"
              type="date"
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm shadow-soft focus:border-blue-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
              value={createdTo}
              onChange={(e) => setCreatedTo(e.target.value)}
              min={createdFrom || undefined}
            />
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor="jobs-report-month"
              className="text-xs font-medium text-muted-foreground"
            >
              Month
            </label>
            <select
              id="jobs-report-month"
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm shadow-soft focus:border-blue-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
              value={monthFilter}
              onChange={(e) =>
                setMonthFilter(e.target.value as "all" | string)
              }
            >
              <option value="all">All months</option>
              {monthFilterOptions.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor="jobs-report-year"
              className="text-xs font-medium text-muted-foreground"
            >
              Year
            </label>
            <select
              id="jobs-report-year"
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm shadow-soft focus:border-blue-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
              value={yearFilter}
              onChange={(e) =>
                setYearFilter(e.target.value as "all" | string)
              }
            >
              <option value="all">All years</option>
              {yearFilterOptions.map((y) => (
                <option key={y} value={String(y)}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="min-h-11 w-full text-muted-foreground sm:w-auto"
            onClick={() => {
              setStatusFilter("all");
              setPriorityFilter("all");
              setPmFilter("all");
              setTopicFilter("all");
              setUserFilter("all");
              setMonthFilter("all");
              setYearFilter("all");
              setCreatedFrom("");
              setCreatedTo("");
              setSearchFilter("");
              setExportError(null);
              setCurrentPage(1);
            }}
          >
            Clear filters
          </Button>
          {filteredReportJobs.length === 0 && visibleReportJobs.length > 0 ? (
            <span className="text-xs text-amber-700">
              No jobs match — loosen filters to see data.
            </span>
          ) : null}
          {dateRangeInvalid ? (
            <span className="text-xs font-medium text-destructive" role="alert">
              Created-to must be on or after Created-from.
            </span>
          ) : null}
        </div>
      </CardContent>
    </Card>

  </>);
}
