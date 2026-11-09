"use client";

import { useLocale } from "@/app/lib/i18n/LocaleProvider";
import { billingStatusKey } from "@/app/lib/i18n/billing-status";
import type { DictKey } from "@/app/lib/i18n/dictionary";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, CreditCard, ExternalLink, RefreshCw } from "lucide-react";

import { Alert, AlertDescription } from "@/app/components/ui/alert";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/app/components/ui/card";
import { useSessionGuard } from "@/app/lib/hooks/useSessionGuard";
import { SettingsPageSkeleton } from "@/app/components/ui/loading";
import BillingDocuments from "./BillingDocuments";
import CompanyBilling from "./CompanyBilling";
import {
  formatBillingDate,
  getBillingLifecycleMessage,
  redirectToStripe,
  rows,
} from "@/app/lib/billing-ui.mjs";

type Tenant = { tenant_id: string; name: string; billing_model?: string };
type Plan = { id: number; code: string; name: string; description?: string; monthly_price: string; billing_interval: string };
type BillingState = {
  tenant_id: string;
  plan: { id: number; code: string; name: string } | null;
  status: string;
  entitlement_level: string;
  reason_code: string;
  current_period_end: string | null;
  trial_ends_at: string | null;
  grace_period_ends_at: string | null;
  cancel_at_period_end: boolean;
  can_manage_billing: boolean;
  can_start_checkout: boolean;
};

function message(payload: unknown, fallback = "billing.failed") {
  if (payload && typeof payload === "object") {
    const detail = (payload as Record<string, unknown>).detail;
    if (typeof detail === "string") return detail;
  }
  return fallback;
}

export default function BillingSettingsClient() {
  const { t, locale } = useLocale();
  const statusLabel = (status: string) => t(billingStatusKey(status));
  const { isAuthenticated, isLoading: sessionLoading } = useSessionGuard({ requireAuth: true });
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState("");
  const [plans, setPlans] = useState<Plan[]>([]);
  const [billing, setBilling] = useState<BillingState | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [action, setAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lifecycle = getBillingLifecycleMessage(billing, locale, t);

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
      if (!tenantResponse.ok) throw new Error(message(tenantPayload, "billing.errorTenant"));
      if (!planResponse.ok) throw new Error(message(planPayload, "billing.errorPlans"));
      const available = rows<Tenant>(tenantPayload);
      setTenants(available);
      const selected = available.find((item) => item.tenant_id === selectedTenantId) || (available.length === 1 ? available[0] : null);
      setTenant(selected);
      setPlans(rows<Plan>(planPayload));
      if (!selected) { setBilling(null); return; }
      const stateResponse = await fetch(
        `/api/billing/status?tenant_id=${encodeURIComponent(selected.tenant_id)}`,
        { cache: "no-store" },
      );
      const statePayload = await stateResponse.json().catch(() => null);
      if (!stateResponse.ok) throw new Error(message(statePayload, "billing.errorStatus"));
      setBilling(statePayload as BillingState);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "billing.errorLoad");
    } finally {
      setLoading(false);
      setHasLoaded(true);
    }
  }, [isAuthenticated, selectedTenantId]);

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
      if (!response.ok) throw new Error(message(payload, "billing.errorStripe"));
      redirectToStripe(String(payload?.url || ""));
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "billing.errorStripe");
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
          <h1 className="text-2xl font-semibold">{t("billing.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("billing.intro")}</p>
        </div>
        <Button variant="outline" size="sm" disabled={loading} onClick={() => void load()}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin motion-reduce:animate-none" : ""}`} />{loading ? t("billing.refreshing") : t("billing.refresh")}</Button>
      </div>

      {error && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{error.startsWith("billing.") ? t(error as DictKey) : error}</AlertDescription></Alert>}

      {tenants.length > 1 && <div className="space-y-2"><label htmlFor="billing-company" className="text-sm font-medium">{t("billing.company")}</label><select id="billing-company" className="w-full rounded-md border bg-background p-3" value={selectedTenantId} onChange={(event) => { setTenant(null); setBilling(null); setSelectedTenantId(event.target.value); }}><option value="">{t("billing.selectCompany")}</option>{tenants.map((item) => <option key={item.tenant_id} value={item.tenant_id}>{item.name}</option>)}</select></div>}
      {tenant && billing?.can_manage_billing && <CompanyBilling key={tenant.tenant_id} tenantId={tenant.tenant_id} onChanged={load} />}

      {tenant?.billing_model !== "property_quantity_v1" && <Card>
        <CardHeader><CardTitle>{t("billing.currentSubscription")}</CardTitle><CardDescription>{tenant?.name}</CardDescription></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div><p className="text-xs text-muted-foreground">{t("billing.plan")}</p><p className="font-medium">{billing?.plan?.name || t("billing.noPlan")}</p></div>
          <div><p className="text-xs text-muted-foreground">{t("billing.status")}</p><Badge variant={billing?.status === "past_due" ? "destructive" : "secondary"}>{statusLabel(billing?.status || "missing")}</Badge></div>
          <div><p className="text-xs text-muted-foreground">{t("billing.periodEnd")}</p><p className="font-medium">{formatBillingDate(billing?.current_period_end, locale)}</p></div>
          <div><p className="text-xs text-muted-foreground">{t("billing.entitlement")}</p><p className="font-medium">{billing?.entitlement_level ? statusLabel(billing.entitlement_level) : "—"}</p></div>
          {lifecycle && (
            <div className="sm:col-span-2 lg:col-span-4">
              <p className={lifecycle.tone === "attention" ? "text-sm text-destructive" : lifecycle.tone === "warning" ? "text-sm text-amber-700" : "text-sm text-muted-foreground"}>
                {lifecycle.message}
              </p>
            </div>
          )}
          {billing?.can_manage_billing && (
            <div className="sm:col-span-2 lg:col-span-4">
              <Button onClick={() => void hostedAction("portal")} disabled={action !== null}>
                <CreditCard className="mr-2 h-4 w-4" />{action === "portal" ? t("billing.opening") : t("billing.manageBilling")}<ExternalLink className="ml-2 h-4 w-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>}

      {billing?.can_manage_billing && tenant?.billing_model !== "property_quantity_v1" && (
        <div className="grid gap-4 md:grid-cols-3">
          {plans.map((plan) => (
            <Card key={plan.id}>
              <CardHeader><CardTitle>{plan.name}</CardTitle><CardDescription>{plan.description || t("billing.defaultPlan")}</CardDescription></CardHeader>
              <CardContent className="space-y-4">
                <p className="text-xl font-semibold">{plan.monthly_price} <span className="text-sm font-normal text-muted-foreground">/{plan.billing_interval === "annual" ? t("billing.year") : t("billing.month")}</span></p>
                <Button className="w-full" variant={billing.plan?.id === plan.id ? "outline" : "default"} disabled={action !== null} onClick={() => void hostedAction(billing.can_start_checkout ? "checkout" : "portal", billing.can_start_checkout ? plan : undefined)}>
                  {action === `plan-${plan.id}` ? t("billing.opening") : billing.plan?.id === plan.id ? t("billing.changePlan") : t("billing.selectPlan")}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {tenant && billing?.can_manage_billing && <BillingDocuments key={tenant.tenant_id} tenantId={tenant.tenant_id} onRefresh={load} companyBilling={tenant.billing_model === "property_quantity_v1"} />}
    </div>
  );
}
