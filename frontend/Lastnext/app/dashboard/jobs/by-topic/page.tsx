// app/dashboard/jobs/by-topic/page.tsx
import React, { Suspense } from "react";
import { getServerSession } from "@/app/lib/session.server";
import {
  fetchAllJobsForDashboard,
  fetchAllTopics,
  fetchProperties,
} from "@/app/lib/data.server";
import JobsByTopicClient from "./topic-client";

export const dynamic = "force-dynamic";

export default async function JobsByTopicPage() {
  const session = await getServerSession();
  const [jobs, topics, properties] = await Promise.all([
    fetchAllJobsForDashboard(),
    fetchAllTopics(),
    session?.user ? fetchProperties() : Promise.resolve([]),
  ]);

  return (
    <div className="w-full">
      <Suspense
        fallback={
          <div className="text-sm text-muted-foreground">Loading...</div>
        }
      >
        <JobsByTopicClient
          initialJobs={jobs || []}
          topics={topics || []}
          properties={properties || []}
        />
      </Suspense>
    </div>
  );
}
