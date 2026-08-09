"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/app/components/ui/button";
import { FeedbackState } from "@/app/components/feedback/FeedbackState";

export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Application route error", error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl items-center px-4">
      <FeedbackState
        variant="error"
        title="Something went wrong"
        description="We could not load this page. Your data has not been changed."
        action={<div className="flex gap-3"><Button onClick={reset}>Try again</Button><Button asChild variant="outline"><Link href="/">Home</Link></Button></div>}
      />
    </main>
  );
}
