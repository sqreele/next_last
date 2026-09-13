"use client";

import useSWR from "swr";
import type { CurrentUserProfile } from "@/app/lib/profile";
import { canAccessBilling } from "@/app/lib/billing-access.mjs";

async function fetchProfile(url: string): Promise<CurrentUserProfile> {
  const response = await fetch(url, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error("Unable to resolve billing access.");
  return response.json() as Promise<CurrentUserProfile>;
}

export function useBillingAccess() {
  const { data, isLoading } = useSWR<CurrentUserProfile>(
    "/api/profile/me",
    fetchProfile,
    {
      revalidateOnFocus: false,
      dedupingInterval: 10_000,
    },
  );

  return {
    canAccessBilling: canAccessBilling(data),
    isBillingAccessLoading: isLoading,
  };
}
