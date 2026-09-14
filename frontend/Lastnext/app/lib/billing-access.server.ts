import "server-only";

import { redirect } from "next/navigation";
import { backendFetch } from "@/app/lib/backend-fetch";
import { API_CONFIG } from "@/app/lib/config";
import { getServerSession } from "@/app/lib/session.server";

export async function requireBillingAccess() {
  const session = await getServerSession();
  const accessToken = session?.user?.accessToken;
  if (!accessToken) redirect("/auth/login");

  const response = await backendFetch(
    `${API_CONFIG.baseUrl}/api/v1/tenant-subscriptions/`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
      cache: "no-store",
    },
  );
  if (response.status === 401) redirect("/auth/login");
  if (response.status === 403) redirect("/dashboard/unauthorized");
  if (!response.ok) throw new Error("Unable to verify Billing access.");
}
