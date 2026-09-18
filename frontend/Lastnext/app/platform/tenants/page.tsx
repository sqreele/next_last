import Link from "next/link";
import { PlatformPage } from "@/app/components/platform/PlatformPage";
import { platformGet } from "@/app/lib/platform-dashboard.server";
import { requirePlatformAccess } from "@/app/lib/platform-access.server";
import { getLifecycleDisplay } from "@/app/lib/billing-ui.mjs";
import { usageDisplay, type PlatformPlan } from "@/app/lib/platform-plans.mjs";

type Value = Record<string, unknown>;

function UsageCell({ used, limit, storage = false }: { used: unknown; limit: unknown; storage?: boolean }) {
  const display = usageDisplay(used, limit, { storage });
  return <div className="whitespace-nowrap"><span>{display.value}</span>{display.overLimit && <span className="block text-xs font-medium text-destructive">Over current plan limit</span>}</div>;
}

export default async function PlatformTenantsPage() {
  await requirePlatformAccess("platform.tenants.read");
  const data = await platformGet("/api/v1/platform/tenants/");
  const rows = (data.results ?? []) as Value[];
  return <PlatformPage title="Tenants"><div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[1100px] text-sm"><thead><tr className="border-b bg-muted/50"><th className="p-3 text-left">Tenant</th><th className="p-3 text-left">Plan</th><th className="p-3 text-left">Subscription</th><th className="p-3 text-left">Properties</th><th className="p-3 text-left">Users</th><th className="p-3 text-left">Jobs this month</th><th className="p-3 text-left">PM schedules</th><th className="p-3 text-left">Assets</th><th className="p-3 text-left">Storage</th></tr></thead><tbody>{rows.map((row) => {
    const subscription = row.subscription as Value;
    const plan = (subscription?.plan ?? {}) as Value & PlatformPlan;
    const usage = (row.latest_usage ?? {}) as Value;
    const lifecycle = getLifecycleDisplay(subscription, String(row.timezone ?? "UTC"));
    return <tr key={String(row.tenant_id)} className="border-b align-top last:border-0"><td className="p-3"><Link className="font-medium underline" href={`/platform/tenants/${row.tenant_id}`}>{String(row.name)}</Link><div className="text-xs text-muted-foreground">{String(row.tenant_id)}</div></td><td className="p-3"><span className="font-medium">{String(plan.name ?? "—")}</span><span className="block text-xs text-muted-foreground">{String(plan.code ?? "—")}</span></td><td className="p-3"><span>{String(subscription?.status ?? row.status)}</span><span className="block whitespace-nowrap text-xs text-muted-foreground">{lifecycle.message}</span></td><td className="p-3"><UsageCell used={usage.property_count ?? row.property_count} limit={plan.max_properties} /></td><td className="p-3"><UsageCell used={usage.active_user_count ?? row.active_membership_count} limit={plan.max_users} /></td><td className="p-3"><UsageCell used={usage.work_order_count} limit={plan.max_monthly_work_orders} /></td><td className="p-3"><UsageCell used={usage.pm_schedule_count} limit={plan.max_pm_schedules} /></td><td className="p-3"><UsageCell used={usage.asset_count} limit={plan.max_assets} /></td><td className="p-3"><UsageCell used={usage.storage_mb} limit={plan.max_storage_mb} storage /></td></tr>;
  })}</tbody></table></div></PlatformPage>;
}
