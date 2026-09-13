import { redirect } from "next/navigation";
import { API_CONFIG } from "@/app/lib/config";
import { backendFetch } from "@/app/lib/backend-fetch";
import { getServerSession } from "@/app/lib/session.server";
import BillingClient, {
  type SubscriptionPlan,
  type TenantSubscription,
} from "./BillingClient";

export const dynamic = "force-dynamic";

async function authorizedBillingFetch(path: string, accessToken: string) {
  const response = await backendFetch(`${API_CONFIG.baseUrl}/api/v1/${path}/`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  if (response.status === 401) redirect("/auth/login");
  if (response.status === 403) redirect("/dashboard");
  if (!response.ok) throw new Error("The billing service is temporarily unavailable.");
  return response.json();
}

export default async function BillingPage() {
  const session = await getServerSession();
  const accessToken = session?.user?.accessToken;
  if (!accessToken) redirect("/auth/login");

  const [subscriptions, plans] = await Promise.all([
    authorizedBillingFetch("tenant-subscriptions", accessToken) as Promise<TenantSubscription[]>,
    authorizedBillingFetch("subscription-plans", accessToken) as Promise<SubscriptionPlan[]>,
  ]);

  return <BillingClient initialSubscriptions={subscriptions} plans={plans} />;
}
