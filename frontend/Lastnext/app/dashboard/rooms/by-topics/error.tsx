"use client";

import Link from "next/link";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent } from "@/app/components/ui/card";
import { AlertCircle, Home, RefreshCw } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  console.error("Rooms by topic route error:", error);

  return (
    <Card>
      <CardContent className="space-y-4 p-5 sm:p-6">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600">
          <AlertCircle className="h-6 w-6" />
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium text-red-700">Rooms by Topic</p>
          <h1 className="text-2xl font-bold text-foreground">
            This page could not load
          </h1>
          <p className="text-sm leading-6 text-muted-foreground">
            We could not load rooms by topic right now. Please retry. If it
            still fails, go back to the dashboard and try again later.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="button" className="w-full sm:w-auto" onClick={reset}>
            <RefreshCw className="mr-2 h-4 w-4" /> Retry
          </Button>
          <Button asChild variant="outline" className="w-full sm:w-auto">
            <Link href="/dashboard">
              <Home className="mr-2 h-4 w-4" /> Go to Dashboard
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
