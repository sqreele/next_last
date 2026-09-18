"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/app/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Input } from "@/app/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/app/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/app/components/ui/table";
import {
  PLATFORM_FEATURES,
  featureStatus,
  usageDisplay,
  type PlatformPlan,
} from "@/app/lib/platform-plans.mjs";

type Value = Record<string, unknown>;
type Props = { data: Value; lifecycle: { label: string; date: string | null; message: string } };
const label = (value: unknown) => String(value ?? "—").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const yesNo = (value: unknown) => value ? "Yes" : "No";
const roleVariant = (role: string): "default" | "secondary" | "outline" => role === "admin" || role === "owner" ? "default" : role === "viewer" ? "outline" : "secondary";

function Identity({ member }: { member: Value }) {
  const primary = String(member.display_name || member.email || member.user || "Unknown user");
  const secondary = member.display_name && member.email ? String(member.email) : member.display_name || member.email ? String(member.user || "") : "";
  return <div className="min-w-0"><p className="truncate font-medium" title={primary}>{primary}</p>{secondary && <p className="truncate text-xs text-muted-foreground" title={secondary}>{secondary}</p>}</div>;
}

function Scope({ member }: { member: Value }) {
  const scope = (member.property_scope ?? {}) as Value;
  if (scope.all_tenant_properties) return <span>All Properties</span>;
  const properties = Array.isArray(scope.properties) ? scope.properties as Value[] : [];
  if (properties.length === 1) return <span title={String(properties[0].property_id ?? "")}>{String(properties[0].name)}</span>;
  if (properties.length > 1) return <details><summary className="cursor-pointer">{properties.length} Properties</summary><p className="mt-1 text-xs text-muted-foreground">{properties.map((p) => String(p.name)).join(", ")}</p></details>;
  return <span>{Number(scope.assigned_property_count ?? 0)} Properties</span>;
}

function Members({ memberships }: { memberships: Value[] }) {
  const [query, setQuery] = useState(""); const [role, setRole] = useState("all"); const [status, setStatus] = useState("all");
  const filtered = useMemo(() => memberships.filter((member) => {
    const text = [member.display_name, member.email, member.user].join(" ").toLowerCase();
    return (!query || text.includes(query.toLowerCase())) && (role === "all" || member.role === role) && (status === "all" || String(Boolean(member.is_active)) === status);
  }), [memberships, query, role, status]);
  const roles = [...new Set(memberships.map((member) => String(member.role)))];
  if (!memberships.length) return <p className="py-6 text-sm text-muted-foreground">No memberships found</p>;
  return <div className="space-y-4"><div className="grid gap-2 sm:grid-cols-3"><Input aria-label="Search users" placeholder="Search users" value={query} onChange={(e) => setQuery(e.target.value)} /><select aria-label="Filter by role" className="h-11 rounded-md border bg-background px-3 text-sm" value={role} onChange={(e) => setRole(e.target.value)}><option value="all">All roles</option>{roles.map((item) => <option key={item} value={item}>{label(item)}</option>)}</select><select aria-label="Filter by status" className="h-11 rounded-md border bg-background px-3 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}><option value="all">All statuses</option><option value="true">Active</option><option value="false">Inactive</option></select></div><Table mobileCards><TableHeader><TableRow><TableHead>User</TableHead><TableHead>Role</TableHead><TableHead>Property Scope</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>{filtered.map((member, index) => <TableRow key={`${String(member.user)}-${String(member.role)}-${index}`}><TableCell mobileLabel="User"><Identity member={member} /></TableCell><TableCell mobileLabel="Role"><Badge variant={roleVariant(String(member.role))}>{label(member.role)}</Badge></TableCell><TableCell mobileLabel="Property scope"><Scope member={member} /></TableCell><TableCell mobileLabel="Status"><Badge variant={member.is_active ? "secondary" : "outline"}>{member.is_active ? "Active" : "Inactive"}</Badge></TableCell></TableRow>)}</TableBody></Table>{!filtered.length && <p className="py-4 text-sm text-muted-foreground">No memberships match these filters.</p>}</div>;
}

const Detail = ({ term, value }: { term: string; value: unknown }) => <div className="flex items-baseline justify-between gap-4 border-b py-2 text-sm last:border-0"><dt className="text-muted-foreground">{term}</dt><dd className="text-right font-medium">{String(value ?? "—")}</dd></div>;

function UsageLimit({ name, used, limit, storage = false }: { name: string; used: unknown; limit: unknown; storage?: boolean }) {
  const display = usageDisplay(used, limit, { storage });
  return <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">{name}</p><p className="text-lg font-semibold">{display.value}</p>{display.overLimit && <p className="mt-1 text-xs font-medium text-destructive">Over current plan limit</p>}</CardContent></Card>;
}

export function TenantDetailClient({ data, lifecycle }: Props) {
  const subscription = (data.subscription ?? {}) as Value; const plan = (subscription.plan ?? {}) as Value & PlatformPlan;
  const memberships = (data.memberships ?? []) as Value[]; const properties = (data.properties ?? []) as Value[]; const usage = ((data.usage ?? []) as Value[])[0]; const binding = (data.stripe_binding ?? subscription) as Value; const webhook = (data.webhook_summary ?? {}) as Value;
  const activeUsers = memberships.filter((m) => m.is_active).length;
  const Metric = ({ name, value }: { name: string; value: unknown }) => <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">{name}</p><p className="truncate text-xl font-semibold" title={String(value ?? "—")}>{String(value ?? "—")}</p></CardContent></Card>;
  return <div className="space-y-6"><section className="rounded-xl border bg-card p-5 shadow-soft sm:p-6"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div><p className="text-sm text-muted-foreground">Tenant ID: <span className="font-mono text-foreground">{String(data.tenant_id)}</span></p><h2 className="mt-1 text-2xl font-bold tracking-tight">{String(data.name)}</h2><p className="mt-1 text-sm text-muted-foreground">{String(data.timezone ?? "UTC")}</p></div><div className="flex flex-wrap gap-2"><Badge variant="secondary">{label(data.status)}</Badge><Badge variant="outline">{label(subscription.status)}</Badge><Badge>{String(subscription.entitlement_level ?? "—")}</Badge></div></div><div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4"><Metric name="Properties" value={properties.length} /><Metric name="Active users" value={activeUsers} /><Metric name="Plan" value={plan.name} /><Metric name="Entitlement" value={subscription.entitlement_level} /></div></section>
    <Card className="border-primary/25"><CardHeader><CardTitle>Subscription lifecycle</CardTitle></CardHeader><CardContent><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6"><div><p className="text-xs text-muted-foreground">Plan</p><p className="font-semibold">{String(plan.name ?? "—")}</p><p className="text-xs text-muted-foreground">Code: {String(plan.code ?? "—")}</p></div><div><p className="text-xs text-muted-foreground">Status</p><p className="font-semibold">{label(subscription.status)}</p></div><div><p className="text-xs text-muted-foreground">Entitlement</p><p className="font-semibold">{String(subscription.entitlement_level ?? "—")}</p></div><div><p className="text-xs text-muted-foreground">{lifecycle.label}</p><p className="font-semibold">{lifecycle.date ?? "—"}</p></div><div><p className="text-xs text-muted-foreground">Cancel at period end</p><p className="font-semibold">{yesNo(subscription.cancel_at_period_end)}</p></div><div><p className="text-xs text-muted-foreground">Monthly price</p><p className="font-semibold">{plan.monthly_price == null ? "—" : `$${Number(plan.monthly_price).toFixed(0)} / month`}</p></div></div></CardContent></Card>
    <Card><CardHeader><CardTitle>Effective plan capabilities</CardTitle></CardHeader><CardContent><div className="grid gap-x-6 sm:grid-cols-2">{PLATFORM_FEATURES.map((feature) => <Detail key={feature.key} term={feature.label} value={featureStatus(plan, feature)} />)}</div></CardContent></Card>
    {binding.provider_mode === "test" && <div role="status" className="rounded-lg border border-amber-500/40 bg-amber-50 p-3 text-sm font-medium text-amber-900">Stripe test mode is active</div>}
    <Tabs defaultValue="overview"><div className="overflow-x-auto pb-1"><TabsList aria-label="Tenant detail sections" className="w-max"><TabsTrigger value="overview">Overview</TabsTrigger><TabsTrigger value="properties">Properties</TabsTrigger><TabsTrigger value="users">Users</TabsTrigger><TabsTrigger value="billing">Billing</TabsTrigger><TabsTrigger value="usage">Usage</TabsTrigger><TabsTrigger value="diagnostics">Diagnostics</TabsTrigger></TabsList></div>
      <TabsContent value="overview"><Card><CardHeader><CardTitle>Overview</CardTitle></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2"><Detail term="Tenant status" value={label(data.status)} /><Detail term="Timezone" value={data.timezone} /><Detail term="Properties" value={properties.length} /><Detail term="Active users" value={activeUsers} /></CardContent></Card></TabsContent>
      <TabsContent value="properties"><Card><CardHeader><CardTitle>Properties</CardTitle></CardHeader><CardContent>{properties.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{properties.map((p) => <div key={String(p.property_id)} className="rounded-lg border p-4"><p className="font-medium">{String(p.name)}</p><p className="mt-1 font-mono text-xs text-muted-foreground">{String(p.property_id)}</p>{Boolean(p.status) && <Badge className="mt-3" variant="outline">{label(p.status)}</Badge>}</div>)}</div> : <p className="py-6 text-sm text-muted-foreground">No properties found</p>}</CardContent></Card></TabsContent>
      <TabsContent value="users"><Card><CardHeader><CardTitle>Users / Memberships</CardTitle></CardHeader><CardContent><Members memberships={memberships} /></CardContent></Card></TabsContent>
      <TabsContent value="billing"><Card><CardHeader><CardTitle>Read-only billing</CardTitle></CardHeader><CardContent><dl><Detail term="Plan" value={plan.name} /><Detail term="Subscription status" value={label(subscription.status)} /><Detail term="Entitlement" value={subscription.entitlement_level} /><Detail term={lifecycle.label} value={lifecycle.date} /><Detail term="Cancel at period end" value={yesNo(subscription.cancel_at_period_end)} /><Detail term="Customer bound" value={yesNo(binding.customer_bound)} /><Detail term="Subscription bound" value={yesNo(binding.subscription_bound)} /><Detail term="Provider mode" value={label(binding.provider_mode)} /></dl></CardContent></Card></TabsContent>
      <TabsContent value="usage"><Card><CardHeader><CardTitle>Usage and plan limits</CardTitle></CardHeader><CardContent>{usage ? <><p className="mb-4 text-sm text-muted-foreground">Current usage period: {String(usage.period_start)} – {String(usage.period_end)}</p><div className="grid grid-cols-2 gap-3 lg:grid-cols-3"><UsageLimit name="Properties" used={usage.property_count} limit={plan.max_properties} /><UsageLimit name="Users" used={usage.active_user_count} limit={plan.max_users} /><UsageLimit name="Jobs this month" used={usage.work_order_count} limit={plan.max_monthly_work_orders} /><UsageLimit name="PM schedules" used={usage.pm_schedule_count} limit={plan.max_pm_schedules} /><UsageLimit name="Assets" used={usage.asset_count} limit={plan.max_assets} /><UsageLimit name="Storage" used={usage.storage_mb} limit={plan.max_storage_mb} storage /></div></> : <p className="py-6 text-sm text-muted-foreground">No usage data available</p>}</CardContent></Card></TabsContent>
      <TabsContent value="diagnostics"><Card><CardHeader><CardTitle>Diagnostics</CardTitle></CardHeader><CardContent><dl><Detail term="Webhook event count" value={webhook.total_receipts ?? "No webhook events recorded"} /><Detail term="Failed event count" value={webhook.failed_receipt_count ?? "—"} /><Detail term="Latest processed time" value={webhook.latest_processed_at ?? "—"} /><Detail term="Stripe binding state" value={binding.subscription_bound ? "Subscription bound" : "Subscription not bound"} /><Detail term="Provider mode" value={label(binding.provider_mode)} /></dl><p className="mt-4 text-xs text-muted-foreground">Webhook receipts are not currently associated with individual tenants.</p></CardContent></Card></TabsContent>
    </Tabs></div>;
}
