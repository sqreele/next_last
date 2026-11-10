"use client";

import React from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Building } from "lucide-react";
import { Bar, BarChart, CartesianGrid, LabelList, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { RoomsInnerSegmentLabel, ROOMS_CHART_MAX, RoomsStackEndLabel } from "./jobs-report-config";
import type { JobsReportModel } from "./useJobsReportModel";

type Props = Pick<
  JobsReportModel,
  "roomsJobsSummary"
  | "filteredReportJobs"
  | "roomsChartHeight"
  | "roomsChartData"
>;

export function JobsReportRoomsChart({
  roomsJobsSummary,
  filteredReportJobs,
  roomsChartHeight,
  roomsChartData,
}: Props) {
  return (<>
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Building className="h-5 w-5" />
          Rooms with jobs
        </CardTitle>
        <p className="text-sm font-normal text-muted-foreground">
          Stacked bars:{" "}
          <span className="text-violet-700 font-medium">PM</span> +{" "}
          <span className="text-sky-700 font-medium">Non-PM</span>. White
          numbers inside each segment when both exist; total at bar end. Same
          counting rules as before (multi-room jobs count per room; no room →
          &quot;No room linked&quot;).
          {roomsJobsSummary.length > ROOMS_CHART_MAX ? (
            <span className="mt-1 block text-amber-800">
              Showing top {ROOMS_CHART_MAX} rooms by job count (
              {roomsJobsSummary.length} rows total).
            </span>
          ) : null}
        </p>
      </CardHeader>
      <CardContent className="pt-0">
        {filteredReportJobs.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No jobs match the filters.
          </p>
        ) : roomsJobsSummary.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No room data on these jobs.
          </p>
        ) : (
          <div
            style={{ height: roomsChartHeight }}
            className="w-full min-h-[14rem]"
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                layout="vertical"
                data={roomsChartData}
                margin={{ top: 8, right: 52, left: 8, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  type="number"
                  tick={{ fontSize: 11 }}
                  stroke="#6b7280"
                  allowDecimals={false}
                />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={108}
                  tick={{ fontSize: 10 }}
                  stroke="#6b7280"
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.[0]) return null;
                    const p = payload[0].payload as {
                      fullLabel: string;
                      roomId: string;
                      pm: number;
                      nonPm: number;
                      total: number;
                    };
                    return (
                      <div className="rounded-md border border-border bg-card px-3 py-2 text-xs shadow-soft">
                        <p className="font-semibold text-foreground">
                          {p.fullLabel}
                        </p>
                        <p className="text-muted-foreground">
                          Room ID: {p.roomId}
                        </p>
                        <p className="text-violet-700">PM: {p.pm}</p>
                        <p className="text-sky-700">Non-PM: {p.nonPm}</p>
                        <p className="mt-1 font-medium text-foreground">
                          Total jobs: {p.total}
                        </p>
                      </div>
                    );
                  }}
                />
                <Legend />
                <Bar
                  dataKey="pm"
                  name="PM"
                  stackId="roomJobs"
                  fill="#7c3aed"
                  radius={[4, 0, 0, 4]}
                >
                  <LabelList
                    dataKey="pm"
                    content={(p) => RoomsInnerSegmentLabel(p, "pm")}
                  />
                  <LabelList
                    dataKey="pm"
                    content={(p) => RoomsStackEndLabel(p, "pm")}
                  />
                </Bar>
                <Bar
                  dataKey="nonPm"
                  name="Non-PM"
                  stackId="roomJobs"
                  fill="#0ea5e9"
                  radius={[0, 4, 4, 0]}
                >
                  <LabelList
                    dataKey="nonPm"
                    content={(p) => RoomsInnerSegmentLabel(p, "nonPm")}
                  />
                  <LabelList
                    dataKey="nonPm"
                    content={(p) => RoomsStackEndLabel(p, "nonPm")}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>

  </>);
}
