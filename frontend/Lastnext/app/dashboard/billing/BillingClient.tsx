"use client";

import { FormEvent, useState } from "react";
import { CalendarDays, CreditCard, Pencil, Save, X } from "lucide-react";
import { Button } from "@/app/components/ui/button";

export type SubscriptionPlan = {
  id: number;
  name: string;
  monthly_price: string;
  billing_interval: "monthly" | "annual";
};

export type TenantSubscription = {
  id: number;
  tenant: number;
  tenant_name: string;
  tenant_public_id: string;
  plan: SubscriptionPlan;
  status: "trialing" | "active" | "past_due" | "cancelled" | "suspended";
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
};

type Props = {
  initialSubscriptions: TenantSubscription[];
  plans: SubscriptionPlan[];
};

const statusLabels: Record<TenantSubscription["status"], string> = {
  trialing: "Trialing",
  active: "Active",
  past_due: "Past due",
  cancelled: "Cancelled",
  suspended: "Suspended",
};

function money(value: string) {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? new Intl.NumberFormat("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)
    : value;
}

function displayDate(value: string | null) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(
    new Date(`${value}T00:00:00Z`),
  );
}

export default function BillingClient({ initialSubscriptions, plans }: Props) {
  const [subscriptions, setSubscriptions] = useState(initialSubscriptions);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(event: FormEvent<HTMLFormElement>, subscription: TenantSubscription) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    const response = await fetch(`/api/v1/tenant-subscriptions/${subscription.id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: data.get("status"),
        plan_id: Number(data.get("plan_id")),
        current_period_start: data.get("current_period_start") || null,
        current_period_end: data.get("current_period_end") || null,
        cancel_at_period_end: data.get("cancel_at_period_end") === "on",
      }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(payload?.detail || "Unable to update billing details.");
      setSaving(false);
      return;
    }
    setSubscriptions((current) =>
      current.map((item) => (item.id === subscription.id ? payload : item)),
    );
    setEditingId(null);
    setSaving(false);
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8">
      <header>
        <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">Account</p>
        <h1 className="mt-1 text-3xl font-bold text-foreground">Billing</h1>
        <p className="mt-2 text-muted-foreground">
          Review each company subscription, billing period, and account status.
        </p>
      </header>

      {error ? (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-800">
          {error}
        </div>
      ) : null}

      {subscriptions.length === 0 ? (
        <section className="rounded-2xl border border-border bg-card p-8 text-center shadow-soft">
          <CreditCard className="mx-auto h-10 w-10 text-muted-foreground" />
          <h2 className="mt-3 text-lg font-bold">No subscription found</h2>
          <p className="mt-1 text-sm text-muted-foreground">There is no billing record for an authorized tenant.</p>
        </section>
      ) : (
        subscriptions.map((subscription) => {
          const editing = editingId === subscription.id;
          return (
            <section key={subscription.id} className="rounded-2xl border border-border bg-card p-5 shadow-soft sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {subscription.tenant_public_id}
                  </p>
                  <h2 className="mt-1 text-xl font-bold text-foreground">{subscription.tenant_name}</h2>
                </div>
                <span className="rounded-full bg-blue-100 px-3 py-1 text-sm font-bold text-blue-800">
                  {statusLabels[subscription.status]}
                </span>
              </div>

              <dl className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl bg-muted p-4">
                  <dt className="text-xs font-semibold uppercase text-muted-foreground">Plan</dt>
                  <dd className="mt-1 font-bold">{subscription.plan.name}</dd>
                </div>
                <div className="rounded-xl bg-muted p-4">
                  <dt className="text-xs font-semibold uppercase text-muted-foreground">Amount</dt>
                  <dd className="mt-1 font-bold">{money(subscription.plan.monthly_price)} · {subscription.plan.billing_interval}</dd>
                </div>
                <div className="rounded-xl bg-muted p-4">
                  <dt className="text-xs font-semibold uppercase text-muted-foreground">Billing period</dt>
                  <dd className="mt-1 font-bold">{displayDate(subscription.current_period_start)} – {displayDate(subscription.current_period_end)}</dd>
                </div>
                <div className="rounded-xl bg-muted p-4">
                  <dt className="text-xs font-semibold uppercase text-muted-foreground">Subscription status / period end</dt>
                  <dd className="mt-1 font-bold">{statusLabels[subscription.status]} · {displayDate(subscription.current_period_end)}</dd>
                </div>
              </dl>

              {editing ? (
                <form onSubmit={(event) => save(event, subscription)} className="mt-6 grid gap-4 rounded-xl border border-border p-4 sm:grid-cols-2">
                  <label className="grid gap-1 text-sm font-semibold">
                    Status
                    <select name="status" defaultValue={subscription.status} className="h-11 rounded-md border border-border bg-background px-3">
                      {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </label>
                  <label className="grid gap-1 text-sm font-semibold">
                    Plan
                    <select name="plan_id" defaultValue={subscription.plan.id} className="h-11 rounded-md border border-border bg-background px-3">
                      {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
                    </select>
                  </label>
                  <label className="grid gap-1 text-sm font-semibold">
                    Period start
                    <input name="current_period_start" type="date" defaultValue={subscription.current_period_start || ""} className="h-11 rounded-md border border-border bg-background px-3" />
                  </label>
                  <label className="grid gap-1 text-sm font-semibold">
                    Due / period end
                    <input name="current_period_end" type="date" defaultValue={subscription.current_period_end || ""} className="h-11 rounded-md border border-border bg-background px-3" />
                  </label>
                  <label className="flex items-center gap-2 text-sm font-semibold sm:col-span-2">
                    <input name="cancel_at_period_end" type="checkbox" defaultChecked={subscription.cancel_at_period_end} className="h-4 w-4" />
                    Cancel at the end of this billing period
                  </label>
                  <div className="flex gap-2 sm:col-span-2">
                    <Button type="submit" disabled={saving}><Save className="mr-2 h-4 w-4" />{saving ? "Saving…" : "Save changes"}</Button>
                    <Button type="button" variant="outline" onClick={() => setEditingId(null)} disabled={saving}><X className="mr-2 h-4 w-4" />Cancel</Button>
                  </div>
                </form>
              ) : (
                <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
                  <span className="flex items-center gap-2 text-sm text-muted-foreground"><CalendarDays className="h-4 w-4" />Next due {displayDate(subscription.current_period_end)}</span>
                  <Button type="button" variant="outline" onClick={() => { setError(null); setEditingId(subscription.id); }}><Pencil className="mr-2 h-4 w-4" />Edit billing</Button>
                </div>
              )}
            </section>
          );
        })
      )}
    </div>
  );
}
