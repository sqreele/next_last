"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMainStore } from "@/app/lib/stores/mainStore";

interface JobDetailPropertyBoundaryProps {
  jobPropertyId: string | number | null | undefined;
  children: React.ReactNode;
}

export function JobDetailPropertyBoundary({
  jobPropertyId,
  children,
}: JobDetailPropertyBoundaryProps) {
  const selectedPropertyId = useMainStore((state) => state.selectedPropertyId);
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const canonicalJobPropertyId =
    jobPropertyId === null || jobPropertyId === undefined
      ? null
      : String(jobPropertyId);
  const requestedPropertyId = searchParams.get("property_id");

  useEffect(() => {
    if (
      !selectedPropertyId ||
      selectedPropertyId !== canonicalJobPropertyId ||
      requestedPropertyId === selectedPropertyId
    ) {
      return;
    }
    const nextSearchParams = new URLSearchParams(searchParams.toString());
    nextSearchParams.set("property_id", selectedPropertyId);
    router.replace(`${pathname}?${nextSearchParams.toString()}`, {
      scroll: false,
    });
  }, [
    canonicalJobPropertyId,
    pathname,
    requestedPropertyId,
    router,
    searchParams,
    selectedPropertyId,
  ]);

  if (!selectedPropertyId) {
    return (
      <div className="pcms-section-card mx-auto max-w-2xl space-y-3 p-6 text-center">
        <h1 className="text-xl font-black text-foreground">
          Select an active property
        </h1>
        <p className="text-sm font-medium text-muted-foreground">
          Job details are shown only inside the active Property context.
        </p>
      </div>
    );
  }

  if (
    !canonicalJobPropertyId ||
    selectedPropertyId !== canonicalJobPropertyId
  ) {
    return (
      <div className="pcms-section-card mx-auto max-w-2xl space-y-3 p-6 text-center">
        <h1 className="text-xl font-black text-foreground">
          This job is outside the active property
        </h1>
        <p className="text-sm font-medium text-muted-foreground">
          Switch back to the job&apos;s Property or return to the active Property
          job list.
        </p>
        <Link
          href={`/dashboard/jobs?property_id=${encodeURIComponent(selectedPropertyId)}`}
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
        >
          View active Property jobs
        </Link>
      </div>
    );
  }

  if (requestedPropertyId !== selectedPropertyId) {
    return (
      <div className="pcms-section-card mx-auto max-w-2xl p-6 text-center text-sm font-semibold text-muted-foreground">
        Loading the job in the active Property context...
      </div>
    );
  }

  return <>{children}</>;
}
