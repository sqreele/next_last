"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/app/components/ui/button";
import { FeedbackState } from "@/app/components/feedback/FeedbackState";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Dashboard route error", error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-3xl items-center px-4">
      <FeedbackState
        variant="error"
        title="Unable to load this dashboard page"
        description="The request could not be completed. Try again, or return to the dashboard."
        action={
          <div className="flex flex-wrap justify-center gap-3">
            <Button type="button" onClick={reset}>Try again</Button>
            <Button asChild variant="outline"><Link href="/dashboard">Dashboard</Link></Button>
          </div>
        }
      />
    </div>
  );
}
