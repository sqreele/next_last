"use client";

import React from "react";

import { Button } from "@/app/components/ui/button";
import { BouncingDotsLoader, PageLoader } from "@/app/components/ui/loading";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Building2 } from "lucide-react";

import { JobsReportProps } from "./report/jobs-report-config";
import { useJobsReportModel } from "./report/useJobsReportModel";
import { JobsReportHeader } from "./report/JobsReportHeader";
import { JobsReportFilterPanel } from "./report/JobsReportFilterPanel";
import { JobsReportRows } from "./report/JobsReportRows";
import { JobsReportStatistics } from "./report/JobsReportStatistics";
import { JobsReportCharts } from "./report/JobsReportCharts";
import { JobsReportRoomsChart } from "./report/JobsReportRoomsChart";
import { JobsReportSummary } from "./report/JobsReportSummary";

export default function JobsReport(props: JobsReportProps) {
  const {
    sessionStatus,
    session,
    selectedProperty,
    userProperties,
    loading,
    loadedPropertyId,
    reportError,
    currentProperty,
    setReloadKey,
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
    currentPage,
    pageSize,
    paginatedReportJobs,
    totalPages,
    statistics,
    jobsByMonthChart,
    jobsAndNightSaleByMonthChart,
    monthlyAndYearlyComparisons,
    utilityLoading,
    utilityError,
    pmVsNonPmChartRows,
    priorityChartRows,
    roomsJobsSummary,
    roomsChartHeight,
    roomsChartData,
  } = useJobsReportModel(props);
  // Check if session is still loading
  if (sessionStatus === "loading") {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Loading Session...
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <BouncingDotsLoader size="md" label="Loading your session..." className="text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  // Check if user is authenticated
  if (sessionStatus === "unauthenticated" || !session?.user) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Authentication Required
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Building2 className="h-12 w-12 mx-auto mb-4 text-gray-300" />
            <p>Please log in to view the jobs report.</p>
            <p className="text-sm mt-2">
              You need to be authenticated to access this feature.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!selectedProperty) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Property Jobs Report
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Building2 className="h-12 w-12 mx-auto mb-4 text-gray-300" />
            <p>
              {userProperties.length
                ? "Select a property to view reports."
                : "You do not have an accessible Property for reporting."}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (loading || (loadedPropertyId !== selectedProperty && !reportError)) {
    return (
      <PageLoader
        label="Loading jobs report"
        description={`Loading report rows${currentProperty?.name ? ` for ${currentProperty.name}` : ""}.`}
      />
    );
  }

  if (reportError) {
    return (
      <Card className="w-full" role="alert">
        <CardHeader>
          <CardTitle>Unable to load report</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-destructive">{reportError}</p>
          <Button
            type="button"
            variant="outline"
            onClick={() => setReloadKey((value) => value + 1)}
          >
            Retry report
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <JobsReportHeader
        currentProperty={currentProperty}
        selectedProperty={selectedProperty}
        filter={filter}
        filteredReportJobs={filteredReportJobs}
        visibleReportJobs={visibleReportJobs}
        handleGenerateExcel={handleGenerateExcel}
        isGeneratingExcel={isGeneratingExcel}
        handleGeneratePdf={handleGeneratePdf}
        isGeneratingPdf={isGeneratingPdf}
        canUseFeature={canUseFeature}
        handleGenerateCSV={handleGenerateCSV}
        dateRangeInvalid={dateRangeInvalid}
        isGeneratingCsv={isGeneratingCsv}
        exportError={exportError}
      />
      <JobsReportFilterPanel
        searchFilter={searchFilter}
        setSearchFilter={setSearchFilter}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        priorityFilter={priorityFilter}
        setPriorityFilter={setPriorityFilter}
        pmFilter={pmFilter}
        setPmFilter={setPmFilter}
        topicFilter={topicFilter}
        setTopicFilter={setTopicFilter}
        jobsWithNoTopicCount={jobsWithNoTopicCount}
        topicFilterOptions={topicFilterOptions}
        userFilter={userFilter}
        setUserFilter={setUserFilter}
        jobsWithNoUserCount={jobsWithNoUserCount}
        userFilterOptions={userFilterOptions}
        createdFrom={createdFrom}
        setCreatedFrom={setCreatedFrom}
        createdTo={createdTo}
        setCreatedTo={setCreatedTo}
        monthFilter={monthFilter}
        setMonthFilter={setMonthFilter}
        monthFilterOptions={monthFilterOptions}
        yearFilter={yearFilter}
        setYearFilter={setYearFilter}
        yearFilterOptions={yearFilterOptions}
        setExportError={setExportError}
        setCurrentPage={setCurrentPage}
        filteredReportJobs={filteredReportJobs}
        visibleReportJobs={visibleReportJobs}
        dateRangeInvalid={dateRangeInvalid}
      />
      <JobsReportRows
        filteredReportJobs={filteredReportJobs}
        currentPage={currentPage}
        pageSize={pageSize}
        visibleReportJobs={visibleReportJobs}
        paginatedReportJobs={paginatedReportJobs}
        selectedProperty={selectedProperty}
        session={session}
        totalPages={totalPages}
        setCurrentPage={setCurrentPage}
      />
      <JobsReportStatistics
        statistics={statistics}
      />
      <JobsReportCharts
        filteredReportJobs={filteredReportJobs}
        statistics={statistics}
        jobsByMonthChart={jobsByMonthChart}
        jobsAndNightSaleByMonthChart={jobsAndNightSaleByMonthChart}
        monthlyAndYearlyComparisons={monthlyAndYearlyComparisons}
        utilityLoading={utilityLoading}
        utilityError={utilityError}
        pmVsNonPmChartRows={pmVsNonPmChartRows}
        priorityChartRows={priorityChartRows}
      />
      <JobsReportRoomsChart
        roomsJobsSummary={roomsJobsSummary}
        filteredReportJobs={filteredReportJobs}
        roomsChartHeight={roomsChartHeight}
        roomsChartData={roomsChartData}
      />
      <JobsReportSummary
        currentProperty={currentProperty}
        statistics={statistics}
        roomsJobsSummary={roomsJobsSummary}
        visibleReportJobs={visibleReportJobs}
      />

    </div>
  );

}
