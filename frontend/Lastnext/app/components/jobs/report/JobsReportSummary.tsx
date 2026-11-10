"use client";

import React from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";

import { format } from "date-fns";

import type { JobsReportModel } from "./useJobsReportModel";

type Props = Pick<
  JobsReportModel,
  "currentProperty"
  | "statistics"
  | "roomsJobsSummary"
  | "visibleReportJobs"
>;

export function JobsReportSummary({
  currentProperty,
  statistics,
  roomsJobsSummary,
  visibleReportJobs,
}: Props) {
  return (<>
    {/* Summary */}
    <Card>
      <CardHeader>
        <CardTitle>Report Summary</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>• Generated on: {format(new Date(), "PPP")}</p>
          <p>• Property: {currentProperty?.name}</p>
          <p>
            • Total jobs in this report (after filters): {statistics.total}
          </p>
          <p>
            • PM jobs: {statistics.pmJobs} · Non-PM: {statistics.nonPmJobs}
          </p>
          <p>• Distinct rooms in chart data: {roomsJobsSummary.length}</p>
          <p>• Jobs loaded for property: {visibleReportJobs.length}</p>
          <p>• Completion rate: {statistics.completionRate}%</p>
          <p>
            • Average response time: {statistics.averageResponseTime} days
          </p>
          <p>
            • High priority jobs requiring attention:{" "}
            {statistics.highPriority}
          </p>
        </div>
      </CardContent>
    </Card>
  </>);
}
