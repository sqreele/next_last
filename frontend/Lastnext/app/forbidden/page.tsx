import Link from "next/link";
import { Button } from "@/app/components/ui/button";
import { FeedbackState } from "@/app/components/feedback/FeedbackState";

export default function ForbiddenPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl items-center px-4">
      <FeedbackState
        variant="unauthorized"
        title="Access denied"
        description="Your account does not have permission to view this page."
        action={<Button asChild><Link href="/dashboard">Go to dashboard</Link></Button>}
      />
    </main>
  );
}
