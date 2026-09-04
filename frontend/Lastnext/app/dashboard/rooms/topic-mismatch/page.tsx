// @ts-nocheck
import React, { Suspense } from "react";
import { Metadata } from "next";
import {
  fetchAllRooms,
  fetchAllTopics,
  fetchAllJobsForDashboard,
} from "@/app/lib/data.server";
import TopicMismatchClient from "./topic-mismatch-client";
import { generatePageMetadata } from "@/app/lib/seo-config";

export const dynamic = "force-dynamic";

export const metadata: Metadata = generatePageMetadata("roomsByTopic");

export default async function RoomsTopicMismatchPage() {
  const [rooms, topics, jobs] = await Promise.all([
    fetchAllRooms(),
    fetchAllTopics(),
    fetchAllJobsForDashboard(),
  ]);

  return (
    <div className="w-full">
      <Suspense
        fallback={
          <div className="text-sm text-muted-foreground">Loading...</div>
        }
      >
        <TopicMismatchClient
          rooms={rooms || []}
          topics={topics || []}
          jobs={jobs || []}
        />
      </Suspense>
    </div>
  );
}
