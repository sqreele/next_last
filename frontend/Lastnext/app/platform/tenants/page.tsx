import Link from "next/link";
import { PlatformPage } from "@/app/components/platform/PlatformPage";
import { platformGet } from "@/app/lib/platform-dashboard.server";
import { requirePlatformAccess } from "@/app/lib/platform-access.server";
import { getLifecycleDisplay } from "@/app/lib/billing-ui.mjs";

export default async function PlatformTenantsPage() {
  await requirePlatformAccess("platform.tenants.read");
  const data = await platformGet("/api/v1/platform/tenants/");
  const rows = (data.results ?? []) as Array<Record<string, unknown>>;
  return <PlatformPage title="Tenants"><div className="overflow-x-auto rounded-lg border"><table className="w-full text-sm"><thead><tr className="border-b bg-muted/50"><th className="p-3 text-left">Tenant</th><th className="p-3 text-left">Plan</th><th className="p-3 text-left">Status</th><th className="p-3 text-left">Lifecycle</th><th className="p-3 text-left">Properties</th><th className="p-3 text-left">Users</th></tr></thead><tbody>{rows.map((row) => { const subscription = row.subscription as Record<string, unknown>; const plan = subscription?.plan as Record<string, unknown>; const lifecycle = getLifecycleDisplay(subscription, String(row.timezone ?? "UTC")); return <tr key={String(row.tenant_id)} className="border-b"><td className="p-3"><Link className="font-medium underline" href={`/platform/tenants/${row.tenant_id}`}>{String(row.name)}</Link><div className="text-xs text-muted-foreground">{String(row.tenant_id)}</div></td><td className="p-3">{String(plan?.name ?? "—")}</td><td className="p-3">{String(subscription?.status ?? row.status)}</td><td className="p-3 whitespace-nowrap text-xs font-medium sm:text-sm">{lifecycle.message}</td><td className="p-3">{String(row.property_count)}</td><td className="p-3">{String(row.active_membership_count)}</td></tr>; })}</tbody></table></div></PlatformPage>;
}
