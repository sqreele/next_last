"use client";

import { useLocale } from "@/app/lib/i18n/LocaleProvider";
import { billingStatusKey } from "@/app/lib/i18n/billing-status";
import type { DictKey } from "@/app/lib/i18n/dictionary";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Building2, CreditCard, Plus, RefreshCw } from "lucide-react";
import { Alert, AlertDescription } from "@/app/components/ui/alert";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/app/components/ui/dialog";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { formatBillingDateTime, redirectToStripe } from "@/app/lib/billing-ui.mjs";

type Action = "start" | "add" | "remove" | "cancel" | "reactivate";
type Property = { property_id: string; name: string; status: string; paid: boolean; billable: boolean; archived: boolean };
type Change = {
  id: string; action: Action; state: string; url: string | null; error_code: string | null;
  quote: { currency: string; unit_amount_minor: number; old_quantity: number; quantity: number;
    monthly_total_minor: number; amount_due_now_minor: number; credit_minor: number;
    lines: { description: string; amount_minor: number }[]; affected_properties?: { property_id: string | null; name: string }[] };
};
type Company = {
  tenant_id: string; name: string; billing_model: string; enabled: boolean; status: string; billing_status?: string;
  reconciliation_status: string; total_properties: number; active_properties: number;
  billing_quantity: number; desired_quantity: number; currency: string; unit_amount_minor: number | null;
  monthly_total_minor: number | null; payment_method: string; next_billing_at: string | null;
  amount_due_minor?: number; timezone?: string;
  cancel_at_period_end: boolean; properties: Property[]; can_modify: boolean;
  prices: { currency: string; unit_amount_minor: number }[]; pending_change: Change | null;
};

async function payload(response: Response, fallback = "billing.failed") {
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(typeof data?.detail === "string" ? data.detail : fallback);
  return data;
}

export default function CompanyBilling({ tenantId, onChanged }: { tenantId: string; onChanged: () => Promise<void> }) {
  const { t, locale } = useLocale();
  const statusLabel = (status: string) => t(billingStatusKey(status));
  const numberLocale = locale === "th" ? "th-TH" : "en-US";
  const actionLabel = (value: Action) => t(`billing.action.${value}`);
  const money = (amount: number | null, currency: string) => amount === null ? "—" : new Intl.NumberFormat(numberLocale, { style: "currency", currency }).format(amount / 100);
  const [company, setCompany] = useState<Company | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState<Action | null>(null);
  const [selection, setSelection] = useState<string[]>([]);
  const [draftName, setDraftName] = useState("");
  const [method, setMethod] = useState("card");
  const [quote, setQuote] = useState<Change | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const load = useCallback(async () => {
    const data = await payload(await fetch(`/api/billing/company?tenant_id=${encodeURIComponent(tenantId)}`, { cache: "no-store" }));
    setCompany(data);
  }, [tenantId]);
  useEffect(() => { void load().catch((e) => setError(e.message)); }, [load]);
  useEffect(() => {
    if (!company?.pending_change) return;
    const timer = setInterval(() => { void load().catch(() => {}); }, 5000);
    return () => clearInterval(timer);
  }, [company?.pending_change, load]);

  async function post(path: string, body: Record<string, unknown> = {}) {
    return payload(await fetch(`/api/billing/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tenant_id: tenantId, ...body }) }));
  }
  async function run(operation: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError(null);
    try { await operation(); } catch (e) { setError(e instanceof Error ? e.message : "billing.failed"); }
    finally { setBusy(false); }
  }
  function open(next: Action, ids: string[] = []) {
    setAction(next); setSelection(ids); setDraftName(""); setQuote(null); setConfirmed(false); setError(null);
  }
  if (!company) return <Card><CardContent className="p-6"><p role={error ? "alert" : "status"}>{error ? (error.startsWith("billing.") ? t(error as DictKey) : error) : t("billing.companyLoading")}</p>{error && <Button variant="outline" onClick={() => void run(load)}>{t("billing.retry")}</Button>}</CardContent></Card>;
  const modern = company.billing_model === "property_quantity_v1";
  const canChange = company.can_modify && company.enabled && !company.pending_change && !busy;
  const eligible = company.properties.filter((p) => !p.billable);

  return <section className="space-y-5" aria-label={t("billing.companyPlan")} aria-busy={busy}>
    {error && !action && <Alert variant="destructive"><AlertDescription role="alert">{error.startsWith("billing.") ? t(error as DictKey) : error}</AlertDescription></Alert>}
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3"><div>
        <CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" />{company.name}</CardTitle>
        <CardDescription>{modern ? t("billing.companyPlan") : t("billing.legacyPlan")}</CardDescription>
      </div><Badge variant={company.billing_status === "past_due" ? "destructive" : "secondary"}>{statusLabel(company.billing_status || company.status)}</Badge></CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">{[
          [t("billing.totalProperties"), company.total_properties], [t("billing.activeProperties"), company.active_properties],
          [t("billing.subscriptionQuantity"), company.billing_quantity], [t("billing.requestedQuantity"), company.desired_quantity],
        ].map(([label, value]) => <div key={String(label)}><p className="text-xs text-muted-foreground">{label}</p><p className="text-2xl font-semibold">{value}</p></div>)}</div>
        {modern && <div className="rounded-xl bg-muted/50 p-4 space-y-2">
          <p className="text-sm text-muted-foreground">{t("billing.monthlyFee")}</p>
          <p className="text-2xl font-semibold">{money(company.unit_amount_minor, company.currency)} × {company.billing_quantity} = {money(company.monthly_total_minor, company.currency)}<span className="text-sm font-normal">{" "}{t("billing.perMonth")}</span></p>
          <p className="text-sm">{company.payment_method === "promptpay" ? t("billing.manualPromptPay") : t("billing.automaticCard")}</p>
          <p className="text-sm text-muted-foreground">{company.cancel_at_period_end ? t("billing.cycleEnd") : t("billing.nextCycle")}: {formatBillingDateTime(company.next_billing_at, company.timezone, locale)}</p>
          <p className="text-sm">{t("billing.outstanding")}: {money(company.amount_due_minor ?? 0, company.currency)}</p>
          <p className="text-xs text-muted-foreground">{t("billing.monthlyNote")}</p>
        </div>}
        {!company.enabled && <p className="text-sm text-amber-700">{t("billing.disabled")}</p>}
        {company.pending_change && <Alert><AlertDescription className="space-y-3">
          <p>{t("billing.pendingChange", { action: actionLabel(company.pending_change.action), status: statusLabel(company.pending_change.state === "applying" ? "applying" : "awaiting_payment") })}</p>
          {company.pending_change.error_code && <p>{t("billing.reviewPending")}</p>}
          {company.pending_change.url && <Button onClick={() => redirectToStripe(company.pending_change!.url!)}>{t("billing.openPayment")}</Button>}
        </AlertDescription></Alert>}
        <div className="flex flex-wrap gap-2">
          {!modern && <Button disabled={!canChange || company.prices.length === 0} onClick={() => open("start")}>{t("billing.startPlan")}</Button>}
          {modern && <><Button disabled={!canChange || company.cancel_at_period_end || company.status === "cancelled"} onClick={() => open("add")}><Plus className="mr-2 h-4 w-4" />{t("billing.addProperty")}</Button>
            <Button variant="outline" disabled={!canChange} onClick={() => open(company.cancel_at_period_end || company.status === "cancelled" ? "reactivate" : "cancel")}>{company.cancel_at_period_end || company.status === "cancelled" ? t("billing.reactivate") : t("billing.cancel")}</Button></>}
          <Button variant="outline" asChild><Link href="/dashboard/properties">{t("billing.manageProperties")}</Link></Button>
          <Button variant="outline" asChild><a href="#billing-documents">{t("billing.viewDocuments")}</a></Button>
          {modern && company.payment_method === "card" && <Button variant="outline" disabled={busy} onClick={() => void run(async () => { const data = await post("portal"); redirectToStripe(data.url); })}><CreditCard className="mr-2 h-4 w-4" />{t("billing.changeCard")}</Button>}
          <Button variant="outline" disabled={busy} onClick={() => void run(async () => { await post("invoice-refresh"); await load(); await onChanged(); })}><RefreshCw className="mr-2 h-4 w-4" />{t("billing.checkPayment")}</Button>
        </div>
      </CardContent>
    </Card>
    {modern && <Card><CardHeader><CardTitle>{t("billing.breakdown")}</CardTitle></CardHeader><CardContent>
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="py-3 pr-4">{t("billing.property")}</th><th className="py-3 pr-4">{t("billing.status")}</th><th className="py-3 pr-4">{t("billing.monthly")}</th><th className="py-3"><span className="sr-only">{t("billing.actions")}</span></th></tr></thead>
        <tbody>{company.properties.map((p) => <tr key={p.property_id} className="border-b"><td className="py-3 pr-4 font-medium">{p.name}</td><td className="py-3 pr-4">{statusLabel(p.status)}</td><td className="py-3 pr-4 whitespace-nowrap">{p.billable ? money(company.unit_amount_minor, company.currency) : "—"}</td><td className="py-3">{p.billable && <Button size="sm" variant="outline" disabled={!canChange} onClick={() => open("remove", [p.property_id])}>{t("billing.stopBilling")}</Button>}</td></tr>)}</tbody>
        <tfoot><tr><th className="py-3 text-left" colSpan={2}>{t("billing.monthlyTotal")}</th><td className="py-3 font-semibold" colSpan={2}>{money(company.monthly_total_minor, company.currency)}</td></tr></tfoot>
      </table></div>
    </CardContent></Card>}
    <Dialog open={Boolean(action)} onOpenChange={(value) => { if (!value && !busy) setAction(null); }}><DialogContent className="max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>{action ? actionLabel(action) : t("billing.title")}</DialogTitle><DialogDescription>{t("billing.quoteHelp")}</DialogDescription></DialogHeader>
      {error && <Alert variant="destructive"><AlertDescription role="alert">{error.startsWith("billing.") ? t(error as DictKey) : error}</AlertDescription></Alert>}
      {!quote && <div className="space-y-4">
        {(action === "start" || action === "add") && <>
          <fieldset className="space-y-2"><legend className="mb-2 text-sm font-medium">{t("billing.chooseProperties")}</legend>{eligible.map((p) => <label key={p.property_id} className="flex items-center gap-3 rounded border p-3"><input type="checkbox" checked={selection.includes(p.property_id)} onChange={(e) => setSelection((ids) => e.target.checked ? [...ids, p.property_id] : ids.filter((id) => id !== p.property_id))} /><span>{p.name}</span></label>)}</fieldset>
          {action === "add" && <div className="space-y-2"><Label htmlFor="new-billable-property">{t("billing.newProperty")}</Label><Input id="new-billable-property" maxLength={255} value={draftName} onChange={(e) => setDraftName(e.target.value)} placeholder={t("billing.propertyName")} /></div>}
          {action === "start" && <div className="space-y-2"><Label htmlFor="company-payment-method">{t("billing.paymentMethod")}</Label><select id="company-payment-method" className="w-full rounded-md border bg-background p-3" value={method} onChange={(e) => setMethod(e.target.value)}><option value="card" disabled={!company.prices.some((p) => p.currency === "usd")}>{t("billing.cardPrice")}</option><option value="promptpay" disabled={!company.prices.some((p) => p.currency === "thb")}>{t("billing.promptpayPrice")}</option></select></div>}
        </>}
        {action === "remove" && <p>{t("billing.removeHelp", { properties: company.properties.filter((p) => selection.includes(p.property_id)).map((p) => p.name).join(", ") })}</p>}
        {action === "cancel" && <p>{t("billing.cancelHelp")}</p>}
        <Button disabled={busy} onClick={() => void run(async () => { setQuote(await post("preview", { action, property_ids: selection, payment_method: method, ...(draftName.trim() ? { draft: { name: draftName.trim() } } : {}) })); })}>{busy ? t("billing.calculating") : t("billing.preview")}</Button>
      </div>}
      {quote && <div className="space-y-4">
        {quote.quote.affected_properties && <div className="space-y-1 text-sm"><p className="font-medium">{t("billing.affectedProperties")}</p>{quote.quote.affected_properties.map((property, index) => <p key={property.property_id || index}>{property.name}</p>)}</div>}
        <div className="rounded-lg bg-muted/50 p-4 space-y-2"><p>{t("billing.propertyQuantity")}: {quote.quote.old_quantity} → {quote.quote.quantity}</p><p>{t("billing.newMonthlyTotal")}: <strong>{money(quote.quote.monthly_total_minor, quote.quote.currency)}</strong></p><p>{t("billing.dueNow")}: <strong>{money(quote.quote.amount_due_now_minor, quote.quote.currency)}</strong></p>{quote.quote.credit_minor > 0 && <p>{t("billing.nextCredit")}: {money(quote.quote.credit_minor, quote.quote.currency)}</p>}</div>
        {quote.quote.lines.map((line, i) => <p key={i} className="text-sm">{line.description}: {money(line.amount_minor, quote.quote.currency)}</p>)}
        <p className="text-sm">{t("billing.activationHelp")}</p>
        <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /><span>{t("billing.consent")}</span></label>
        <div className="flex gap-2"><Button disabled={busy || !confirmed} onClick={() => void run(async () => {
          const result: Change = await post("confirm", { operation_id: quote.id });
          setAction(null); await load(); await onChanged();
          if (result.url) redirectToStripe(result.url);
        })}>{busy ? t("billing.confirming") : t("billing.confirm")}</Button><Button variant="outline" disabled={busy} onClick={() => { setQuote(null); setConfirmed(false); }}>{t("billing.editChange")}</Button></div>
      </div>}
    </DialogContent></Dialog>
  </section>;
}
