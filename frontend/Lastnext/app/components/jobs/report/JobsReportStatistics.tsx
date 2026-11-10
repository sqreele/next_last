"use client";

import React from "react";

import { Card, CardContent } from "@/app/components/ui/card";
import { FileText, Clock, CheckCircle2, AlertTriangle, Wrench, ClipboardList } from "lucide-react";

import type { JobsReportModel } from "./useJobsReportModel";

type Props = Pick<
  JobsReportModel,
  "statistics"
>;

export function JobsReportStatistics({
  statistics,
}: Props) {
  return (<>
    {/* Key Statistics */}
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 shrink-0 text-blue-600" />
            <div className="min-w-0">
              <p className="text-2xl font-bold">{statistics.total}</p>
              <p className="text-sm text-muted-foreground">Total</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2">
            <Wrench className="h-5 w-5 shrink-0 text-violet-600" />
            <div className="min-w-0">
              <p className="text-2xl font-bold">{statistics.pmJobs}</p>
              <p className="text-sm text-muted-foreground">PM jobs</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 shrink-0 text-sky-600" />
            <div className="min-w-0">
              <p className="text-2xl font-bold">{statistics.nonPmJobs}</p>
              <p className="text-sm text-muted-foreground">Non-PM</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" />
            <div className="min-w-0">
              <p className="text-2xl font-bold">
                {statistics.completionRate}%
              </p>
              <p className="text-sm text-muted-foreground">Complete</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 shrink-0 text-orange-600" />
            <div className="min-w-0">
              <p className="text-2xl font-bold">
                {statistics.averageResponseTime}d
              </p>
              <p className="text-sm text-muted-foreground">Avg time</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 shrink-0 text-red-600" />
            <div className="min-w-0">
              <p className="text-2xl font-bold">{statistics.highPriority}</p>
              <p className="text-sm text-muted-foreground">High Prio</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>

  </>);
}
