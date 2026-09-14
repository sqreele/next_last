import { PlatformPage } from "@/app/components/platform/PlatformPage";
import { platformGet } from "@/app/lib/platform-dashboard.server";
import { requirePlatformAccess } from "@/app/lib/platform-access.server";

export default async function PlatformOverviewPage() {
  await requirePlatformAccess("platform.tenants.read");
  const data = await platformGet("/api/v1/platform/summary/");
  const cards = ["total_tenants", "trialing_subscriptions", "active_subscriptions", "past_due_subscriptions", "cancelled_subscriptions", "subscriptions_expiring_soon", "unbound_subscriptions"];
  return <PlatformPage title="Platform Overview">
    {data.provider_mode === "test" && <p className="rounded-md border border-amber-400 bg-amber-50 p-3 text-amber-900">Stripe test mode is active in this deployment.</p>}
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{cards.map((key) => <div key={key} className="rounded-lg border bg-card p-4"><p className="text-sm text-muted-foreground">{key.replaceAll("_", " ")}</p><p className="mt-2 text-2xl font-bold">{String(data[key] ?? 0)}</p></div>)}</section>
  </PlatformPage>;
}
