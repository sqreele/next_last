import "server-only";

import { backendFetch } from "@/app/lib/backend-fetch";
import { API_CONFIG } from "@/app/lib/config";
import type { PlatformPlan } from "@/app/lib/platform-plans.mjs";

/** Public, read-only projection of the active SubscriptionPlan commercial catalog. */
export async function getCommercialPlans(): Promise<PlatformPlan[]> {
  const response = await backendFetch(`${API_CONFIG.baseUrl}/api/v1/commercial-plans/`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Commercial plans are unavailable (${response.status}).`);
  return response.json() as Promise<PlatformPlan[]>;
}
