"use client";

import React from "react";

import { Button } from "@/app/components/ui/button";

import { Card, CardHeader, CardTitle } from "@/app/components/ui/card";
import { FileText, Building2, FileSpreadsheet, ClipboardList } from "lucide-react";

import { canExportJobsReport } from "@/app/lib/jobs-report.mjs";

import type { JobsReportModel } from "./useJobsReportModel";

type Props = Pick<
  JobsReportModel,
  "currentProperty"
  | "selectedProperty"
  | "filter"
  | "filteredReportJobs"
  | "visibleReportJobs"
  | "handleGenerateExcel"
  | "isGeneratingExcel"
  | "handleGeneratePdf"
  | "isGeneratingPdf"
  | "canUseFeature"
  | "handleGenerateCSV"
  | "dateRangeInvalid"
  | "isGeneratingCsv"
  | "exportError"
>;

export function JobsReportHeader({
  currentProperty,
  selectedProperty,
  filter,
  filteredReportJobs,
  visibleReportJobs,
  handleGenerateExcel,
  isGeneratingExcel,
  handleGeneratePdf,
  isGeneratingPdf,
  canUseFeature,
  handleGenerateCSV,
  dateRangeInvalid,
  isGeneratingCsv,
  exportError,
}: Props) {
  return (<>
    {/* Header */}
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <CardTitle className="flex min-w-0 items-start gap-2">
              <Building2 className="mt-0.5 h-5 w-5 shrink-0" />
              <span className="break-words">
                {currentProperty?.name} - Jobs Report
              </span>
            </CardTitle>
            <p className="mt-1 break-all text-xs text-muted-foreground sm:text-sm">
              Property ID: {selectedProperty}
              {filter !== "all" ? ` · Tab filter: ${filter}` : ""}
            </p>
          </div>
          <div className="flex w-full flex-col items-stretch gap-2 lg:w-auto lg:items-end">
            <p className="text-xs text-muted-foreground">
              Export uses filtered rows ({filteredReportJobs.length}/
              {visibleReportJobs.length})
            </p>
            <div className="grid w-full grid-cols-3 gap-2 lg:w-auto">
              <Button
                onClick={handleGenerateExcel}
                disabled={
                  isGeneratingExcel || filteredReportJobs.length === 0
                }
                isLoading={isGeneratingExcel}
                loadingText="Building Excel..."
                className="min-w-0 items-center justify-center gap-1 bg-emerald-600 px-2 text-white hover:bg-emerald-700 sm:gap-2 sm:px-4"
              >
                <FileSpreadsheet className="h-4 w-4" />
                <span className="hidden sm:inline">Export Excel</span>
                <span className="sm:hidden">Excel</span>
                <span className="text-xs opacity-90">
                  ({filteredReportJobs.length})
                </span>
              </Button>
              <Button
                onClick={handleGeneratePdf}
                disabled={isGeneratingPdf || filteredReportJobs.length === 0}
                isLoading={isGeneratingPdf}
                loadingText="Building PDF..."
                className="min-w-0 items-center justify-center gap-1 bg-rose-600 px-2 text-white hover:bg-rose-700 sm:gap-2 sm:px-4"
              >
                <FileText className="h-4 w-4" />
                <span className="hidden sm:inline">Export PDF</span>
                <span className="sm:hidden">PDF</span>
              </Button>
              {canUseFeature('csv_export') ? <Button
                onClick={handleGenerateCSV}
                disabled={
                  dateRangeInvalid ||
                  !canExportJobsReport({
                    propertyId: selectedProperty,
                    rowCount: filteredReportJobs.length,
                    exporting: isGeneratingCsv,
                  })
                }
                isLoading={isGeneratingCsv}
                loadingText="Exporting CSV..."
                variant="outline"
                className="min-w-0 items-center justify-center gap-1 px-2 sm:gap-2 sm:px-4"
              >
                <ClipboardList className="h-4 w-4" />
                CSV
              </Button> : null}
            </div>
            {exportError ? (
              <p className="text-sm font-medium text-destructive" role="alert">
                Unable to export CSV. {exportError}
              </p>
            ) : null}
          </div>
        </div>
      </CardHeader>
    </Card>

    {/* Filters — same scope as statistics and CSV export */}

  </>);
}
