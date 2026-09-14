import { PlatformPage } from "@/app/components/platform/PlatformPage";
import { platformGet } from "@/app/lib/platform-dashboard.server";
import { requirePlatformAccess } from "@/app/lib/platform-access.server";

export default async function PlatformTenantDetailPage({ params }: { params: Promise<{ tenantId: string }> }) {
  await requirePlatformAccess("platform.tenants.read"); const { tenantId } = await params;
  const data = await platformGet(`/api/v1/platform/tenants/${encodeURIComponent(tenantId)}/`);
  const subscription = data.subscription as Record<string, unknown>;
  const memberships = (data.memberships ?? []) as Array<Record<string, unknown>>;
  return <PlatformPage title={`Tenant: ${String(data.name)}`}><section className="grid gap-4 md:grid-cols-2"><div className="rounded-lg border p-4"><h2 className="font-semibold">Overview</h2><p>{String(data.tenant_id)} · {String(data.timezone)}</p><p>Status: {String(data.status)}</p></div><div className="rounded-lg border p-4"><h2 className="font-semibold">Subscription</h2><p>Status: {String(subscription.status)}</p><p>Entitlement: {String(subscription.entitlement_level)}</p><p>Provider mode: {String(subscription.provider_mode)}</p></div></section><section className="rounded-lg border p-4"><h2 className="font-semibold">Users / Memberships</h2><ul className="mt-2 space-y-1 text-sm">{memberships.map((m) => <li key={`${m.user}-${m.role}`}>{String(m.user)} — {String(m.role)} ({m.is_active ? "active" : "inactive"})</li>)}</ul></section></PlatformPage>;
}
