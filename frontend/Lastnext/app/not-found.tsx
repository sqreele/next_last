import Link from "next/link";
import { Button } from "@/app/components/ui/button";
import { FeedbackState } from "@/app/components/feedback/FeedbackState";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl items-center px-4">
      <FeedbackState
        variant="unavailable"
        title="Page not found"
        description="The address may be incorrect, or the page may have moved."
        action={<Button asChild><Link href="/dashboard">Go to dashboard</Link></Button>}
      />
    </main>
  );
}
