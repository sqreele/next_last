"use client";

import React from "react";

import { useMainStore } from "@/app/lib/stores/mainStore";

import { Job, JobStatus, JobPriority } from "@/app/lib/types";

import { format } from "date-fns";
import { exportJobsToExcel } from "@/app/lib/utils/excel-export";
import { exportJobsReportToPdf } from "@/app/lib/utils/pdf-export";
import { type PmFilterType, type TopicFilterValue, type UserFilterValue } from "@/app/lib/jobs-report-data";

import {
  buildJobsReportCsvUrl,
  canExportJobsReport,
  getCsvFilename,
  type JobsReportFilters,
} from "@/app/lib/jobs-report.mjs";

import { ReportStatistics } from "./jobs-report-config";

interface Options {
  currentProperty: { name?: string } | null | undefined;
  selectedProperty: string | null;
  statusFilter: JobStatus | "all";
  priorityFilter: JobPriority | "all";
  pmFilter: PmFilterType;
  topicFilter: TopicFilterValue;
  userFilter: UserFilterValue;
  monthFilter: string;
  yearFilter: string;
  createdFrom: string;
  createdTo: string;
  searchFilter: string;
  exportInFlightRef: React.MutableRefObject<boolean>;
  dateRangeInvalid: boolean;
  filteredReportJobs: Job[];
  isGeneratingCsv: boolean;
  activeFilters: JobsReportFilters;
  exportControllerRef: React.MutableRefObject<AbortController | null>;
  setExportError: React.Dispatch<React.SetStateAction<string | null>>;
  setIsGeneratingCsv: React.Dispatch<React.SetStateAction<boolean>>;
  setIsGeneratingExcel: React.Dispatch<React.SetStateAction<boolean>>;
  userProperties: Parameters<typeof exportJobsToExcel>[1];
  statistics: ReportStatistics;
  setIsGeneratingPdf: React.Dispatch<React.SetStateAction<boolean>>;
}

export function useJobsReportExports({ currentProperty, selectedProperty, statusFilter, priorityFilter, pmFilter, topicFilter, userFilter, monthFilter, yearFilter, createdFrom, createdTo, searchFilter, exportInFlightRef, dateRangeInvalid, filteredReportJobs, isGeneratingCsv, activeFilters, exportControllerRef, setExportError, setIsGeneratingCsv, setIsGeneratingExcel, userProperties, statistics, setIsGeneratingPdf }: Options) {
  // Shared filename + filter-description helpers used by all exports.
  const buildExportFilename = (extension: string) => {
    const propertyName =
      currentProperty?.name || `Property ${selectedProperty}`;
    const date = format(new Date(), "yyyy-MM-dd");
    const filterParts = [
      statusFilter !== "all" ? statusFilter : "",
      priorityFilter !== "all" ? priorityFilter : "",
      pmFilter !== "all" ? pmFilter : "",
      topicFilter === "none"
        ? "no-topic"
        : topicFilter !== "all"
          ? `topic-${topicFilter}`
          : "",
      userFilter === "none"
        ? "no-user"
        : userFilter !== "all"
          ? `user-${userFilter.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "")}`
          : "",
      monthFilter !== "all" ? `month-${monthFilter}` : "",
      yearFilter !== "all" ? `year-${yearFilter}` : "",
      createdFrom.trim() ? `from-${createdFrom}` : "",
      createdTo.trim() ? `to-${createdTo}` : "",
    ].filter(Boolean);
    const filterSlug = filterParts.length ? `-${filterParts.join("-")}` : "";
    return `${propertyName.replace(/\s+/g, "-")}-jobs-report${filterSlug}-${date}.${extension}`
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/-+/g, "-");
  };

  const buildFilterDescription = () => {
    const parts: string[] = [];
    if (statusFilter !== "all") parts.push(`status=${statusFilter}`);
    if (priorityFilter !== "all") parts.push(`priority=${priorityFilter}`);
    if (pmFilter !== "all") parts.push(`type=${pmFilter}`);
    if (topicFilter !== "all")
      parts.push(`topic=${topicFilter === "none" ? "none" : topicFilter}`);
    if (userFilter !== "all")
      parts.push(
        `assignee=${userFilter === "none" ? "unassigned" : userFilter}`,
      );
    if (monthFilter !== "all") parts.push(`month=${monthFilter}`);
    if (yearFilter !== "all") parts.push(`year=${yearFilter}`);
    if (createdFrom.trim()) parts.push(`from=${createdFrom}`);
    if (createdTo.trim()) parts.push(`to=${createdTo}`);
    if (searchFilter.trim()) parts.push(`search=${searchFilter.trim()}`);
    return parts.length ? parts.join("; ") : "no filters applied";
  };

  // CSV is generated from a fresh, server-authorized copy of the same filters.
  const handleGenerateCSV = async () => {
    if (
      exportInFlightRef.current ||
      dateRangeInvalid ||
      !canExportJobsReport({
        propertyId: selectedProperty,
        rowCount: filteredReportJobs.length,
        exporting: isGeneratingCsv,
      })
    ) return;

    const exportPropertyId = selectedProperty;
    const exportUrl = buildJobsReportCsvUrl({
      propertyId: exportPropertyId,
      filters: activeFilters,
    });
    if (!exportUrl || !exportPropertyId) return;

    const controller = new AbortController();
    exportControllerRef.current?.abort();
    exportControllerRef.current = controller;
    exportInFlightRef.current = true;
    setExportError(null);
    setIsGeneratingCsv(true);
    try {
      const response = await fetch(exportUrl, {
        signal: controller.signal,
        cache: "no-store",
      });
      if (!response.ok) {
        let message = "Unable to export CSV.";
        try {
          const payload = (await response.json()) as { detail?: unknown };
          if (payload.detail) message = String(payload.detail);
        } catch {
          // Preserve the stable user-facing fallback.
        }
        throw new Error(message);
      }
      if (
        controller.signal.aborted ||
        useMainStore.getState().selectedPropertyId !== exportPropertyId
      ) return;

      const blob = await response.blob();
      const filename = getCsvFilename(
        response.headers.get("content-disposition"),
        `jobs-report-${exportPropertyId}-${format(new Date(), "yyyy-MM-dd")}.csv`,
      );
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      if (controller.signal.aborted) return;
      setExportError(
        error instanceof Error ? error.message : "Unable to export CSV.",
      );
    } finally {
      exportInFlightRef.current = false;
      setIsGeneratingCsv(false);
    }
  };

  const handleGenerateExcel = async () => {
    if (!filteredReportJobs.length) {
      alert(
        "No jobs match the current filters. Adjust filters or clear them to export.",
      );
      return;
    }
    try {
      setIsGeneratingExcel(true);
      const propertyName =
        currentProperty?.name || `Property ${selectedProperty}`;
      // Yield to the browser so the spinner can paint before XLSX work blocks the main thread.
      await new Promise((resolve) => setTimeout(resolve, 0));
      exportJobsToExcel(filteredReportJobs, userProperties, {
        propertyName,
        summary: statistics,
        filterDescription: buildFilterDescription(),
        filename: buildExportFilename("xlsx"),
        includeImages: true,
        maxImageColumns: 3,
        includeUserDetails: true,
        includeRoomDetails: true,
        includePropertyDetails: true,
        dateFormat: "readable",
      });
    } catch (error: unknown) {
      console.error("Error generating Excel:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      alert(`Failed to generate Excel: ${message}`);
    } finally {
      setIsGeneratingExcel(false);
    }
  };

  const handleGeneratePdf = async () => {
    if (!filteredReportJobs.length) {
      alert(
        "No jobs match the current filters. Adjust filters or clear them to export.",
      );
      return;
    }
    try {
      setIsGeneratingPdf(true);
      const propertyName =
        currentProperty?.name || `Property ${selectedProperty}`;
      await new Promise((resolve) => setTimeout(resolve, 0));
      await exportJobsReportToPdf(filteredReportJobs, userProperties, {
        propertyName,
        summary: statistics,
        filterDescription: buildFilterDescription(),
        filename: buildExportFilename("pdf"),
        includeImages: true,
        maxImageColumns: 3,
      });
    } catch (error: unknown) {
      console.error("Error generating PDF:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      alert(`Failed to generate PDF: ${message}`);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  return {
    handleGenerateCSV,
    handleGenerateExcel,
    handleGeneratePdf,
  };
}
