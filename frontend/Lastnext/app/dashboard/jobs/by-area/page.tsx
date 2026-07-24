import React, { Suspense } from "react";
import type { Metadata } from "next";
import { getServerSession } from "@/app/lib/session.server";
import { fetchAllJobsForDashboard } from "@/app/lib/data.server";
import JobsByAreaClient from "./area-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Jobs by Area",
  description:
    "Maintenance jobs grouped by their selected property area or zone.",
};

export default async function JobsByAreaPage() {
  const session = await getServerSession();
  const accessToken = session?.user?.accessToken;
  const jobs = await fetchAllJobsForDashboard(accessToken).catch(() => []);

  return (
    <div className="w-full max-w-none space-y-5 px-3 py-4 sm:px-6 sm:py-5 lg:mx-auto lg:max-w-7xl">
      <Suspense
        fallback={
          <div className="text-sm text-muted-foreground">
            Loading jobs by area...
          </div>
        }
      >
        <JobsByAreaClient initialJobs={jobs || []} />
      </Suspense>
    </div>
  );
}
