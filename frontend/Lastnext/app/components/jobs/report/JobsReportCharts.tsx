"use client";

import React from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Calendar, TrendingUp, Settings, Wrench } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatChartCount, formatChartCountWithZero, LABEL_TEXT_STYLE } from "./jobs-report-config";
import type { JobsReportModel } from "./useJobsReportModel";

type Props = Pick<
  JobsReportModel,
  "filteredReportJobs"
  | "statistics"
  | "jobsByMonthChart"
  | "jobsAndNightSaleByMonthChart"
  | "monthlyAndYearlyComparisons"
  | "utilityLoading"
  | "utilityError"
  | "pmVsNonPmChartRows"
  | "priorityChartRows"
>;

export function JobsReportCharts({
  filteredReportJobs,
  statistics,
  jobsByMonthChart,
  jobsAndNightSaleByMonthChart,
  monthlyAndYearlyComparisons,
  utilityLoading,
  utilityError,
  pmVsNonPmChartRows,
  priorityChartRows,
}: Props) {
  return (<>
    {/* Charts — filtered jobs only */}
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-5 w-5" />
            Jobs by status
          </CardTitle>
          <p className="text-sm font-normal text-muted-foreground">
            Count per status for the current filter selection.
          </p>
        </CardHeader>
        <CardContent className="pt-0">
          {filteredReportJobs.length === 0 ? (
            <div className="flex h-72 min-h-[18rem] items-center justify-center text-sm text-muted-foreground">
              No jobs match the filters.
            </div>
          ) : (
            <div className="h-72 w-full min-h-[18rem]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={statistics.jobsByStatus}
                  margin={{ top: 28, right: 12, left: 8, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis
                    dataKey="status"
                    tick={{ fontSize: 11 }}
                    stroke="#6b7280"
                    interval={0}
                    angle={-20}
                    textAnchor="end"
                    height={56}
                  />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    stroke="#6b7280"
                    allowDecimals={false}
                  />
                  <Tooltip />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]} name="Jobs">
                    {statistics.jobsByStatus.map((entry) => (
                      <Cell key={`cell-${entry.status}`} fill={entry.color} />
                    ))}
                    <LabelList
                      dataKey="count"
                      position="top"
                      formatter={formatChartCountWithZero}
                      fill="#374151"
                      style={LABEL_TEXT_STYLE}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Calendar className="h-5 w-5" />
            Jobs by month (created)
          </CardTitle>
          <p className="text-sm font-normal text-muted-foreground">
            Chronological trend from filtered jobs (tooltip includes YoY %).
          </p>
        </CardHeader>
        <CardContent className="pt-0">
          {jobsByMonthChart.length === 0 ? (
            <div className="flex h-72 min-h-[18rem] items-center justify-center text-sm text-muted-foreground">
              No jobs match the filters.
            </div>
          ) : (
            <div className="h-72 w-full min-h-[18rem]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={jobsAndNightSaleByMonthChart}
                  margin={{ top: 28, right: 12, left: 8, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11 }}
                    stroke="#6b7280"
                  />
                  <YAxis
                    yAxisId="jobs"
                    tick={{ fontSize: 11 }}
                    stroke="#6b7280"
                    allowDecimals={false}
                  />
                  <YAxis
                    yAxisId="nightSale"
                    orientation="right"
                    tick={{ fontSize: 11 }}
                    stroke="#16a34a"
                    allowDecimals={false}
                  />
                  <Tooltip
                    formatter={(value, name, item) => {
                      const rawYoy =
                        name === "Jobs"
                          ? item?.payload?.jobsYoyPct
                          : item?.payload?.nightSaleYoyPct;
                      const yoy =
                        typeof rawYoy === "number"
                          ? rawYoy
                          : typeof rawYoy === "string"
                            ? Number(rawYoy)
                            : null;
                      const valueText =
                        typeof value === "number"
                          ? value.toLocaleString()
                          : String(value);
                      const yoyText =
                        yoy == null ||
                        Number.isNaN(yoy) ||
                        !Number.isFinite(yoy)
                          ? "N/A"
                          : `${yoy >= 0 ? "+" : ""}${yoy.toFixed(1)}%`;
                      return [`${valueText} (YoY ${yoyText})`, String(name)];
                    }}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    yAxisId="jobs"
                    dataKey="jobs"
                    name="Jobs"
                    stroke="#2563eb"
                    strokeWidth={2.5}
                    dot={{ r: 4 }}
                    activeDot={{ r: 6 }}
                  >
                    <LabelList
                      dataKey="jobs"
                      position="top"
                      formatter={formatChartCount}
                      fill="#374151"
                      style={LABEL_TEXT_STYLE}
                    />
                  </Line>
                  <Line
                    type="monotone"
                    yAxisId="nightSale"
                    dataKey="nightSale"
                    name="Night sale"
                    stroke="#16a34a"
                    strokeWidth={2.5}
                    dot={{ r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>

    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <TrendingUp className="h-5 w-5" />
          Month-by-month & year-to-year comparison
        </CardTitle>
        <p className="text-sm font-normal text-muted-foreground">
          Compares current month job orders and PM mix against last month and
          the same month last year.
        </p>
      </CardHeader>
      <CardContent className="pt-0">
        {filteredReportJobs.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No jobs match the filters.
          </p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-border p-4">
              <h3 className="text-sm font-semibold text-foreground">
                Month by month ({monthlyAndYearlyComparisons.monthLabel} vs{" "}
                {monthlyAndYearlyComparisons.previousMonthLabel})
              </h3>
              <div className="mt-3 space-y-2">
                {monthlyAndYearlyComparisons.monthOverMonth.map((row) => (
                  <div
                    key={`mom-${row.label}`}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <span className="text-muted-foreground">{row.label}</span>
                    <span className="text-muted-foreground tabular-nums">
                      {row.current} vs {row.previous}
                    </span>
                    <span
                      className={`tabular-nums font-medium ${
                        row.delta > 0
                          ? "text-green-600"
                          : row.delta < 0
                            ? "text-red-600"
                            : "text-muted-foreground"
                      }`}
                    >
                      {row.delta >= 0 ? "+" : ""}
                      {row.delta}
                      {row.deltaPct === null
                        ? ""
                        : ` (${row.deltaPct >= 0 ? "+" : ""}${row.deltaPct}%)`}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-border p-4">
              <h3 className="text-sm font-semibold text-foreground">
                Year to year ({monthlyAndYearlyComparisons.monthLabel} vs{" "}
                {monthlyAndYearlyComparisons.sameMonthLastYearLabel})
              </h3>
              <div className="mt-3 space-y-2">
                {monthlyAndYearlyComparisons.yearOverYear.map((row) => (
                  <div
                    key={`yoy-${row.label}`}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <span className="text-muted-foreground">{row.label}</span>
                    <span className="text-muted-foreground tabular-nums">
                      {row.current} vs {row.previous}
                    </span>
                    <span
                      className={`tabular-nums font-medium ${
                        row.delta > 0
                          ? "text-green-600"
                          : row.delta < 0
                            ? "text-red-600"
                            : "text-muted-foreground"
                      }`}
                    >
                      {row.delta >= 0 ? "+" : ""}
                      {row.delta}
                      {row.deltaPct === null
                        ? ""
                        : ` (${row.deltaPct >= 0 ? "+" : ""}${row.deltaPct}%)`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50/50 p-4">
          <h3 className="text-sm font-semibold text-blue-900">
            Utility Consumption comparison (Night Sale vs Jobs)
          </h3>
          {utilityLoading ? (
            <p className="mt-2 text-sm text-blue-700">
              Loading utility consumption...
            </p>
          ) : utilityError ? (
            <p className="mt-2 text-sm text-red-600">{utilityError}</p>
          ) : (
            <>
              <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-5">
                <div>
                  <p className="text-blue-700">Current Night Sale</p>
                  <p className="font-semibold tabular-nums text-blue-900">
                    {monthlyAndYearlyComparisons.utility.currentNightSale.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-blue-700">MoM Night Sale Δ</p>
                  <p className="font-semibold tabular-nums text-blue-900">
                    {monthlyAndYearlyComparisons.utility
                      .monthOverMonthNightSale >= 0
                      ? "+"
                      : ""}
                    {monthlyAndYearlyComparisons.utility.monthOverMonthNightSale.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-blue-700">YoY Night Sale Δ</p>
                  <p className="font-semibold tabular-nums text-blue-900">
                    {monthlyAndYearlyComparisons.utility
                      .yearOverYearNightSale >= 0
                      ? "+"
                      : ""}
                    {monthlyAndYearlyComparisons.utility.yearOverYearNightSale.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-blue-700">Night Sale / Job order</p>
                  <p className="font-semibold tabular-nums text-blue-900">
                    {monthlyAndYearlyComparisons.utility.nightSalePerJobOrder.toFixed(
                      2,
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-blue-700">Night Sale / PM job</p>
                  <p className="font-semibold tabular-nums text-blue-900">
                    {monthlyAndYearlyComparisons.utility.nightSalePerPmJob.toFixed(
                      2,
                    )}
                  </p>
                </div>
              </div>
              <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <div className="rounded-md border border-blue-200 bg-card/80 p-3">
                  <p className="text-blue-700">
                    MoM Night Sale / Job order Δ
                  </p>
                  <p className="font-semibold tabular-nums text-blue-900">
                    {monthlyAndYearlyComparisons.utility
                      .monthOverMonthNightSalePerJobOrder >= 0
                      ? "+"
                      : ""}
                    {monthlyAndYearlyComparisons.utility.monthOverMonthNightSalePerJobOrder.toFixed(
                      2,
                    )}
                  </p>
                </div>
                <div className="rounded-md border border-blue-200 bg-card/80 p-3">
                  <p className="text-blue-700">
                    YoY Night Sale / Job order Δ
                  </p>
                  <p className="font-semibold tabular-nums text-blue-900">
                    {monthlyAndYearlyComparisons.utility
                      .yearOverYearNightSalePerJobOrder >= 0
                      ? "+"
                      : ""}
                    {monthlyAndYearlyComparisons.utility.yearOverYearNightSalePerJobOrder.toFixed(
                      2,
                    )}
                  </p>
                </div>
              </div>
              <div className="mt-4 h-64 w-full rounded-md border border-blue-100 bg-card p-3">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={[
                      {
                        period:
                          monthlyAndYearlyComparisons.previousMonthLabel,
                        nightSale:
                          monthlyAndYearlyComparisons.utility
                            .previousMonthNightSale,
                        perJobOrder:
                          monthlyAndYearlyComparisons.utility
                            .previousMonthNightSalePerJobOrder,
                      },
                      {
                        period: monthlyAndYearlyComparisons.monthLabel,
                        nightSale:
                          monthlyAndYearlyComparisons.utility
                            .currentNightSale,
                        perJobOrder:
                          monthlyAndYearlyComparisons.utility
                            .nightSalePerJobOrder,
                      },
                      {
                        period:
                          monthlyAndYearlyComparisons.sameMonthLastYearLabel,
                        nightSale:
                          monthlyAndYearlyComparisons.utility
                            .sameMonthLastYearNightSale,
                        perJobOrder:
                          monthlyAndYearlyComparisons.utility
                            .sameMonthLastYearNightSalePerJobOrder,
                      },
                    ]}
                    margin={{ top: 10, right: 12, left: 6, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#dbeafe" />
                    <XAxis
                      dataKey="period"
                      tick={{ fontSize: 11 }}
                      stroke="#1d4ed8"
                    />
                    <YAxis
                      yAxisId="left"
                      tick={{ fontSize: 11 }}
                      stroke="#1d4ed8"
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      tick={{ fontSize: 11 }}
                      stroke="#0e7490"
                    />
                    <Tooltip />
                    <Legend />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="nightSale"
                      name="Night Sale"
                      stroke="#1d4ed8"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="perJobOrder"
                      name="Night Sale / Job order"
                      stroke="#0e7490"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>

    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Wrench className="h-5 w-5" />
            PM vs non-PM
          </CardTitle>
          <p className="text-sm font-normal text-muted-foreground">
            Based on{" "}
            <span className="font-medium">Preventive maintenance</span> flag
            on each job (
            <code className="text-xs">is_preventivemaintenance</code>).
          </p>
        </CardHeader>
        <CardContent className="pt-0">
          {filteredReportJobs.length === 0 ? (
            <div className="flex h-56 min-h-[14rem] items-center justify-center text-sm text-muted-foreground">
              No jobs match the filters.
            </div>
          ) : (
            <div className="h-56 w-full min-h-[14rem]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={pmVsNonPmChartRows}
                  margin={{ top: 28, right: 12, left: 8, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 12 }}
                    stroke="#6b7280"
                  />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    stroke="#6b7280"
                    allowDecimals={false}
                  />
                  <Tooltip />
                  <Bar dataKey="value" name="Jobs" radius={[6, 6, 0, 0]}>
                    {pmVsNonPmChartRows.map((row) => (
                      <Cell key={row.name} fill={row.fill} />
                    ))}
                    <LabelList
                      dataKey="value"
                      position="top"
                      formatter={formatChartCountWithZero}
                      fill="#374151"
                      style={LABEL_TEXT_STYLE}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Settings className="h-5 w-5" />
            Jobs by priority
          </CardTitle>
          <p className="text-sm font-normal text-muted-foreground">
            Horizontal bars — value labels at the end of each bar.
          </p>
        </CardHeader>
        <CardContent className="pt-0">
          {filteredReportJobs.length === 0 ? (
            <div className="flex h-56 min-h-[14rem] items-center justify-center text-sm text-muted-foreground">
              No jobs match the filters.
            </div>
          ) : (
            <div className="h-56 w-full min-h-[14rem] max-w-2xl lg:max-w-none">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={priorityChartRows}
                  margin={{ top: 8, right: 48, left: 8, bottom: 8 }}
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
                    dataKey="name"
                    width={64}
                    tick={{ fontSize: 12 }}
                    stroke="#6b7280"
                  />
                  <Tooltip />
                  <Bar dataKey="value" name="Jobs" radius={[0, 6, 6, 0]}>
                    {priorityChartRows.map((row) => (
                      <Cell key={row.name} fill={row.fill} />
                    ))}
                    <LabelList
                      dataKey="value"
                      position="right"
                      formatter={formatChartCountWithZero}
                      fill="#374151"
                      style={LABEL_TEXT_STYLE}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>

  </>);
}
