"use client";

import useSWR from "swr";
import { useMainStore } from "@/app/lib/stores/mainStore";
import type { PlanFeature } from "@/app/design-system/navigation-config";
import { canUseFeature, type PlanCapabilities } from "@/app/lib/plan-capabilities.mjs";

type EntitlementResponse = { features?: Partial<PlanCapabilities> };

async function fetchEntitlement(url: string): Promise<EntitlementResponse> {
  const response = await fetch(url, { credentials: "include", cache: "no-store" });
  if (!response.ok) throw new Error("Unable to load plan capabilities.");
  return response.json() as Promise<EntitlementResponse>;
}

export function usePlanCapabilities() {
  const propertyId = useMainStore((state) => state.selectedPropertyId);
  const key = propertyId
    ? `/api/v1/tenant-subscriptions/entitlement/?property_id=${encodeURIComponent(propertyId)}`
    : null;
  const { data, isLoading } = useSWR<EntitlementResponse>(key, fetchEntitlement, {
    revalidateOnFocus: false,
    dedupingInterval: 10_000,
  });
  const features = data?.features;
  return {
    features,
    canUseFeature: (feature: PlanFeature) => canUseFeature(features, feature),
    isLoading,
  };
}
