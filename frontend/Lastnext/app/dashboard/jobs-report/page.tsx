"use client";

import React from "react";
import { PageHeader } from "@/app/components/pcms-ui";
import JobsReport from "@/app/components/jobs/JobsReport";

export default function JobsReportPage() {
  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="Jobs Report"
        description="Filter maintenance jobs, review operating trends, and export the results."
      />
      <JobsReport />
    </div>
  );
}
