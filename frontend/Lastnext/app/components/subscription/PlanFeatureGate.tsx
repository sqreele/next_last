"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePlanCapabilities } from "@/app/lib/hooks/usePlanCapabilities";
import type { PlanFeature } from "@/app/design-system/navigation-config";

function routeFeature(pathname: string): PlanFeature | null {
  if (pathname.startsWith("/dashboard/preventive-maintenance/schedule") || pathname.startsWith("/dashboard/preventive-maintenance/plans")) return "pm_schedules";
  if (pathname.startsWith("/dashboard/preventive-maintenance")) return "preventive_maintenance";
  if (pathname.startsWith("/dashboard/jobs-report") || pathname.startsWith("/dashboard/chartdashboard")) return "advanced_reports";
  return null;
}

export function PlanFeatureGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const feature = routeFeature(pathname);
  const { canUseFeature, isLoading } = usePlanCapabilities();

  if (!feature || isLoading) return <>{children}</>;
  if (canUseFeature(feature)) return <>{children}</>;

  return (
    <section className="mx-auto mt-12 max-w-xl rounded-xl border bg-card p-8 text-center shadow-soft" role="status">
      <h1 className="text-2xl font-semibold">Feature unavailable</h1>
      <p className="mt-3 text-muted-foreground">This feature is not available on your current plan.</p>
      <Link className="mt-6 inline-flex min-h-11 items-center rounded-md bg-primary px-5 font-semibold text-primary-foreground" href="/pricing/">
        View pricing
      </Link>
    </section>
  );
}
