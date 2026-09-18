import { PlatformPage } from "@/app/components/platform/PlatformPage";
import { CommercialPlans } from "@/app/components/platform/CommercialPlans";
import { platformGet } from "@/app/lib/platform-dashboard.server";
import { requirePlatformAccess } from "@/app/lib/platform-access.server";
import { getLifecycleDisplay } from "@/app/lib/billing-ui.mjs";
import type { PlatformPlan } from "@/app/lib/platform-plans.mjs";

export default async function PlatformOverviewPage() {
  await requirePlatformAccess("platform.tenants.read");
  const data = await platformGet("/api/v1/platform/summary/");
  const plans = (data.commercial_plans ?? []) as PlatformPlan[];
  const cards = ["total_tenants", "trialing_subscriptions", "active_subscriptions", "past_due_subscriptions", "cancelled_subscriptions", "subscriptions_expiring_soon", "unbound_subscriptions"];
  const attentionRows = (data.attention_subscriptions ?? []) as Array<Record<string, unknown>>;
  return <PlatformPage title="Platform Overview">
    {data.provider_mode === "test" && <p className="rounded-md border border-amber-400 bg-amber-50 p-3 text-amber-900">Stripe test mode is active in this deployment.</p>}
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{cards.map((key) => <div key={key} className="rounded-lg border bg-card p-4"><p className="text-sm text-muted-foreground">{key.replaceAll("_", " ")}</p><p className="mt-2 text-2xl font-bold">{String(data[key] ?? 0)}</p></div>)}</section>
    <CommercialPlans plans={plans} />
    {attentionRows.length > 0 && <section className="rounded-lg border"><h2 className="border-b p-4 font-semibold">Subscription attention</h2><div className="divide-y">{attentionRows.map((row) => { const lifecycle = getLifecycleDisplay(row, String(row.tenant_timezone ?? "UTC")); return <div className="grid gap-1 p-4 text-sm sm:grid-cols-3 sm:gap-4" key={String(row.id)}><span className="font-medium">{String(row.tenant_name)}</span><span>{String(row.status)}</span><span>{lifecycle.message}</span></div>; })}</div></section>}
  </PlatformPage>;
}
