import "server-only";

import { redirect } from "next/navigation";
import { backendFetch } from "@/app/lib/backend-fetch";
import { API_CONFIG } from "@/app/lib/config";
import { getServerSession } from "@/app/lib/session.server";
import { canAccessPlatform } from "@/app/lib/platform-access.mjs";
import type { CurrentUserProfile } from "@/app/lib/profile";

/** Server UX guard only; backend platform permissions remain authoritative. */
export async function requirePlatformAccess(capability: string) {
  const session = await getServerSession();
  const accessToken = session?.user?.accessToken;
  if (!accessToken) redirect("/auth/login");

  const response = await backendFetch(
    `${API_CONFIG.baseUrl}/api/v1/user-profiles/me/`,
    {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      cache: "no-store",
    },
  );
  if (response.status === 401) redirect("/auth/login");
  if (!response.ok) throw new Error("Unable to verify platform access.");
  const profile = await response.json() as CurrentUserProfile;
  if (!canAccessPlatform(profile, capability)) redirect("/dashboard/unauthorized");
}
