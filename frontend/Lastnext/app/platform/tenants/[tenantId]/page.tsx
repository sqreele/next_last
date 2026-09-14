import { PlatformPage } from "@/app/components/platform/PlatformPage";
import { platformGet } from "@/app/lib/platform-dashboard.server";
import { requirePlatformAccess } from "@/app/lib/platform-access.server";
import { getLifecycleDisplay } from "@/app/lib/billing-ui.mjs";

export default async function PlatformTenantDetailPage({ params }: { params: Promise<{ tenantId: string }> }) {
  await requirePlatformAccess("platform.tenants.read"); const { tenantId } = await params;
  const data = await platformGet(`/api/v1/platform/tenants/${encodeURIComponent(tenantId)}/`);
  const subscription = data.subscription as Record<string, unknown>;
  const memberships = (data.memberships ?? []) as Array<Record<string, unknown>>;
  const lifecycle = getLifecycleDisplay(subscription, String(data.timezone ?? "UTC"));
  const lifecycleFields = lifecycle.label === "Expiry date unavailable" ? [[lifecycle.label, ""]] : [[lifecycle.label, lifecycle.date ?? ""]];
  return <PlatformPage title={`Tenant: ${String(data.name)}`}><section className="grid gap-4 md:grid-cols-2"><div className="rounded-lg border p-4"><h2 className="font-semibold">Overview</h2><p>{String(data.tenant_id)} · {String(data.timezone)}</p><p>Status: {String(data.status)}</p></div><div className="rounded-lg border p-4"><h2 className="font-semibold">Subscription Lifecycle</h2><dl className="mt-2 space-y-1 text-sm"><div><dt className="inline text-muted-foreground">Status: </dt><dd className="inline">{String(subscription.status)}</dd></div><div><dt className="inline text-muted-foreground">Entitlement: </dt><dd className="inline">{String(subscription.entitlement_level)}</dd></div>{lifecycleFields.map(([label, value]) => <div key={label}><dt className="inline text-muted-foreground">{label}{value ? ": " : ""}</dt>{value && <dd className="inline">{value}</dd>}</div>)}{["active", "cancelled"].includes(String(subscription.status)) && <div><dt className="inline text-muted-foreground">Cancel at period end: </dt><dd className="inline">{subscription.cancel_at_period_end ? "Yes" : "No"}</dd></div>}</dl></div></section><section className="rounded-lg border p-4"><h2 className="font-semibold">Users / Memberships</h2><ul className="mt-2 space-y-1 text-sm">{memberships.map((m) => <li key={`${m.user}-${m.role}`}>{String(m.user)} — {String(m.role)} ({m.is_active ? "active" : "inactive"})</li>)}</ul></section></PlatformPage>;
}
