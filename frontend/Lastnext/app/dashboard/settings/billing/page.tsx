"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, CreditCard, ExternalLink, RefreshCw } from "lucide-react";

import { Alert, AlertDescription } from "@/app/components/ui/alert";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/app/components/ui/card";
import { useSessionGuard } from "@/app/lib/hooks/useSessionGuard";
import { SettingsPageSkeleton } from "@/app/components/ui/loading";
import {
  billingStatusLabel,
  formatBillingDate,
  redirectToStripe,
  rows,
} from "@/app/lib/billing-ui.mjs";

type Tenant = { tenant_id: string; name: string };
type Plan = { id: number; code: string; name: string; description?: string; monthly_price: string; billing_interval: string };
type BillingState = {
  tenant_id: string;
  plan: { id: number; code: string; name: string } | null;
  status: string;
  entitlement_level: string;
  current_period_end: string | null;
  trial_ends_at: string | null;
  grace_period_ends_at: string | null;
  cancel_at_period_end: boolean;
  can_manage_billing: boolean;
  can_start_checkout: boolean;
};

function message(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object") {
    const detail = (payload as Record<string, unknown>).detail;
    if (typeof detail === "string") return detail;
  }
  return fallback;
}

export default function BillingSettingsPage() {
  const { isAuthenticated, isLoading: sessionLoading } = useSessionGuard({ requireAuth: true });
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [billing, setBilling] = useState<BillingState | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [action, setAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    setError(null);
    try {
      const [tenantResponse, planResponse] = await Promise.all([
        fetch("/api/billing/tenants", { cache: "no-store" }),
        fetch("/api/billing/plans", { cache: "no-store" }),
      ]);
      const tenantPayload = await tenantResponse.json().catch(() => null);
      const planPayload = await planResponse.json().catch(() => null);
      if (!tenantResponse.ok) throw new Error(message(tenantPayload, "Unable to load billing tenant."));
      if (!planResponse.ok) throw new Error(message(planPayload, "Unable to load plans."));
      const selected = rows<Tenant>(tenantPayload)[0] || null;
      setTenant(selected);
      setPlans(rows<Plan>(planPayload));
      if (!selected) throw new Error("No tenant is available for billing.");
      const stateResponse = await fetch(
        `/api/billing/status?tenant_id=${encodeURIComponent(selected.tenant_id)}`,
        { cache: "no-store" },
      );
      const statePayload = await stateResponse.json().catch(() => null);
      if (!stateResponse.ok) throw new Error(message(statePayload, "Unable to load subscription status."));
      setBilling(statePayload as BillingState);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load billing.");
    } finally {
      setLoading(false);
      setHasLoaded(true);
    }
  }, [isAuthenticated]);

  useEffect(() => { void load(); }, [load]);

  async function hostedAction(path: "checkout" | "portal", plan?: Plan) {
    if (!tenant || !billing?.can_manage_billing) return;
    setAction(plan ? `plan-${plan.id}` : path);
    setError(null);
    try {
      const response = await fetch(`/api/billing/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenant_id: tenant.tenant_id, ...(plan ? { plan: plan.id } : {}) }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(message(payload, "Unable to open Stripe billing."));
      redirectToStripe(String(payload?.url || ""));
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Unable to open Stripe billing.");
      setAction(null);
    }
  }

  if (sessionLoading || (loading && !hasLoaded)) {
    return <SettingsPageSkeleton className="max-w-5xl" />;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-8" aria-busy={loading || action !== null}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Billing</h1>
          <p className="text-sm text-muted-foreground">Stripe securely manages card payments, invoices, and receipts.</p>
        </div>
        <Button variant="outline" size="sm" disabled={loading} onClick={() => void load()}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin motion-reduce:animate-none" : ""}`} />{loading ? "Refreshing…" : "Refresh"}</Button>
      </div>

      {error && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>}

      <Card>
        <CardHeader><CardTitle>Current subscription</CardTitle><CardDescription>{tenant?.name}</CardDescription></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div><p className="text-xs text-muted-foreground">Plan</p><p className="font-medium">{billing?.plan?.name || "No plan"}</p></div>
          <div><p className="text-xs text-muted-foreground">Status</p><Badge variant={billing?.status === "past_due" ? "destructive" : "secondary"}>{billingStatusLabel(billing?.status || "missing")}</Badge></div>
          <div><p className="text-xs text-muted-foreground">Current period end</p><p className="font-medium">{formatBillingDate(billing?.current_period_end)}</p></div>
          <div><p className="text-xs text-muted-foreground">Entitlement</p><p className="font-medium">{billing?.entitlement_level || "—"}</p></div>
          {billing?.trial_ends_at && <div><p className="text-xs text-muted-foreground">Trial ends</p><p className="font-medium">{formatBillingDate(billing.trial_ends_at)}</p></div>}
          {billing?.grace_period_ends_at && <div><p className="text-xs text-muted-foreground">Grace deadline</p><p className="font-medium">{formatBillingDate(billing.grace_period_ends_at)}</p></div>}
          {billing?.cancel_at_period_end && <div className="sm:col-span-2"><p className="text-sm text-amber-700">Cancellation is scheduled at the end of the paid period.</p></div>}
          {billing?.can_manage_billing && (
            <div className="sm:col-span-2 lg:col-span-4">
              <Button onClick={() => void hostedAction("portal")} disabled={action !== null}>
                <CreditCard className="mr-2 h-4 w-4" />{action === "portal" ? "Opening…" : "Manage billing"}<ExternalLink className="ml-2 h-4 w-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {billing?.can_manage_billing && (
        <div className="grid gap-4 md:grid-cols-3">
          {plans.map((plan) => (
            <Card key={plan.id}>
              <CardHeader><CardTitle>{plan.name}</CardTitle><CardDescription>{plan.description || "StayMaint subscription plan"}</CardDescription></CardHeader>
              <CardContent className="space-y-4">
                <p className="text-xl font-semibold">{plan.monthly_price} <span className="text-sm font-normal text-muted-foreground">/{plan.billing_interval}</span></p>
                <Button className="w-full" variant={billing.plan?.id === plan.id ? "outline" : "default"} disabled={action !== null} onClick={() => void hostedAction(billing.can_start_checkout ? "checkout" : "portal", billing.can_start_checkout ? plan : undefined)}>
                  {action === `plan-${plan.id}` ? "Opening…" : billing.plan?.id === plan.id ? "Change plan" : "Select plan"}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
