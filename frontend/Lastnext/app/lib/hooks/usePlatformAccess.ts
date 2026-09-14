"use client";

import useSWR from "swr";
import type { CurrentUserProfile } from "@/app/lib/profile";
import { canAccessPlatform, isPlatformUser } from "@/app/lib/platform-access.mjs";

async function fetchProfile(url: string): Promise<CurrentUserProfile> {
  const response = await fetch(url, { credentials: "include", cache: "no-store" });
  if (!response.ok) throw new Error("Unable to resolve platform access.");
  return response.json() as Promise<CurrentUserProfile>;
}

/** Client navigation helper only; APIs must use HasPlatformCapability. */
export function usePlatformAccess() {
  const { data, isLoading } = useSWR<CurrentUserProfile>("/api/profile/me", fetchProfile, {
    revalidateOnFocus: false,
    dedupingInterval: 10_000,
  });
  return {
    canAccessPlatform: (capability: string) => canAccessPlatform(data, capability),
    isPlatformUser: isPlatformUser(data),
    isPlatformAccessLoading: isLoading,
  };
}
