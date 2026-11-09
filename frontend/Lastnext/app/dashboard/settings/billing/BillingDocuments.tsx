"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Download, FileText, QrCode, RefreshCw } from "lucide-react";

import { Alert, AlertDescription } from "@/app/components/ui/alert";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { Textarea } from "@/app/components/ui/textarea";
import { formatBillingDate, redirectToStripe } from "@/app/lib/billing-ui.mjs";

type Profile = { legal_name: string; address: string; tax_id: string; branch: string; email: string };
type Plan = { id: number; name: string; amount: string; billing_interval: string };
type Invoice = {
  id: number; number: string; receipt_number: string | null; status: string;
  currency: string; total: string; issued_at: string; due_at: string | null; paid_at: string | null;
};
const emptyProfile: Profile = { legal_name: "", address: "", tax_id: "", branch: "", email: "" };
const statusLabels: Record<string, string> = {
  open: "รอชำระเงิน", paid: "ชำระแล้ว", void: "ยกเลิก", uncollectible: "หนี้ที่เรียกเก็บไม่ได้",
};

async function jsonResponse(response: Response) {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const errors = payload && typeof payload === "object"
      ? Object.entries(payload).filter(([key]) => key !== "code").map(([key, value]) =>
        key === "detail" ? String(value) : `${key}: ${Array.isArray(value) ? value.join(", ") : String(value)}`,
      ).join("; ") : "";
    throw new Error(errors || "ไม่สามารถดำเนินการได้ กรุณาลองใหม่");
  }
  return payload;
}

export default function BillingDocuments({ tenantId, onRefresh, companyBilling = false }: {
  tenantId: string; onRefresh: () => Promise<void>; companyBilling?: boolean;
}) {
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [saved, setSaved] = useState(false);
  const [available, setAvailable] = useState(false);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [nextBefore, setNextBefore] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadInvoices = useCallback(async (before?: number) => {
    const payload = await jsonResponse(await fetch(
      `/api/billing/invoices?tenant_id=${encodeURIComponent(tenantId)}${before ? `&before=${before}` : ""}`,
      { cache: "no-store" },
    ));
    setInvoices((current) => before ? [...current, ...payload.results] : payload.results);
    setNextBefore(payload.next_before);
  }, [tenantId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setSaved(false);
    setAvailable(false);
    setError(null);
    void (async () => {
      try {
        // Local document history remains usable when the payment provider is
        // temporarily unavailable while retrieving current plan prices.
        await Promise.all([loadInvoices(), (async () => {
          const payload = await jsonResponse(await fetch(`/api/billing/profile?tenant_id=${encodeURIComponent(tenantId)}`, { cache: "no-store" }));
          if (cancelled) return;
          setProfile({ ...emptyProfile, ...payload.profile });
          setSaved(Boolean(payload.profile));
          setAvailable(Boolean(companyBilling ? payload.provider_available : payload.promptpay_available));
          if (payload.promptpay_available && !companyBilling) {
            const quotes = await jsonResponse(await fetch(`/api/billing/promptpay?tenant_id=${encodeURIComponent(tenantId)}`, { cache: "no-store" }));
            if (cancelled) return;
            setPlans(quotes.results);
          } else setPlans([]);
        })()]);
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "โหลดข้อมูลออกบิลไม่สำเร็จ");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [tenantId, loadInvoices, companyBilling]);

  async function run(action: string, operation: () => Promise<void>) {
    if (busy) return;
    setBusy(action);
    setError(null);
    setNotice(null);
    try { await operation(); }
    catch (actionError) { setError(actionError instanceof Error ? actionError.message : "ดำเนินการไม่สำเร็จ"); }
    finally { setBusy(null); }
  }

  async function post(action: string, values: Record<string, unknown> = {}) {
    return jsonResponse(await fetch(`/api/billing/${action}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenant_id: tenantId, ...values }),
    }));
  }

  function saveProfile(event: FormEvent) {
    event.preventDefault();
    void run("save", async () => {
      const payload = await post("profile", profile);
      setProfile(payload.profile);
      setSaved(true);
      setNotice("บันทึกข้อมูลแล้ว ข้อมูลนี้จะใช้กับบิลใหม่ ส่วนบิลที่ออกแล้วจะคงข้อมูลเดิม");
    });
  }

  function edit(key: keyof Profile, value: string) {
    setProfile((current) => ({ ...current, [key]: value }));
    setSaved(false);
    setNotice(null);
  }

  async function download(invoice: Invoice, kind: "invoice" | "receipt") {
    const response = await fetch(`/api/billing/document?tenant_id=${encodeURIComponent(tenantId)}&document_id=${invoice.id}&kind=${kind}`, { cache: "no-store" });
    if (!response.ok) { await jsonResponse(response); return; }
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement("a");
    link.href = url;
    link.download = `${kind === "receipt" ? invoice.receipt_number : invoice.number}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <section id="billing-documents" className="space-y-6 scroll-mt-20" aria-label="ข้อมูลออกบิลและ PromptPay" aria-busy={loading || busy !== null}>
    {error && <Alert variant="destructive"><AlertDescription role="alert">{error}</AlertDescription></Alert>}
    {notice && <p role="status" className="text-sm text-emerald-700">{notice}</p>}
    <Card>
      <CardHeader>
        <CardTitle>ข้อมูลออกบิล</CardTitle>
        <CardDescription>ใช้สำหรับใบแจ้งหนี้และใบเสร็จรับเงิน ผู้ให้บริการไม่ได้จดทะเบียนภาษีมูลค่าเพิ่ม</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? <p role="status">กำลังโหลดข้อมูล…</p> : <form onSubmit={saveProfile} className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2 space-y-2"><Label htmlFor="billing-name">ชื่อบุคคล / บริษัท *</Label><Input id="billing-name" autoComplete="organization" value={profile.legal_name} required maxLength={255} onChange={(e) => edit("legal_name", e.target.value)} disabled={busy !== null} /></div>
          <div className="sm:col-span-2 space-y-2"><Label htmlFor="billing-address">ที่อยู่สำหรับออกบิล *</Label><Textarea id="billing-address" autoComplete="street-address" value={profile.address} required maxLength={2000} onChange={(e) => edit("address", e.target.value)} disabled={busy !== null} /></div>
          <div className="space-y-2"><Label htmlFor="billing-tax-id">เลขประจำตัวผู้เสียภาษี (ถ้ามี)</Label><Input id="billing-tax-id" inputMode="numeric" pattern="[0-9]{13}" maxLength={13} value={profile.tax_id} onChange={(e) => edit("tax_id", e.target.value)} disabled={busy !== null} /></div>
          <div className="space-y-2"><Label htmlFor="billing-branch">สำนักงานใหญ่ / สาขา (ถ้ามี)</Label><Input id="billing-branch" maxLength={100} value={profile.branch} onChange={(e) => edit("branch", e.target.value)} disabled={busy !== null} /></div>
          <div className="sm:col-span-2 space-y-2"><Label htmlFor="billing-email">อีเมลรับบิล *</Label><Input id="billing-email" type="email" autoComplete="email" required maxLength={254} value={profile.email} onChange={(e) => edit("email", e.target.value)} disabled={busy !== null} /></div>
          <div className="sm:col-span-2"><Button type="submit" disabled={busy !== null}>{busy === "save" ? "กำลังบันทึก…" : "บันทึกข้อมูลออกบิล"}</Button></div>
        </form>}
      </CardContent>
    </Card>
    {!companyBilling && <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><QrCode className="h-5 w-5" />ชำระด้วย PromptPay</CardTitle>
        <CardDescription>รับบิลแต่ละรอบแล้วสแกนจ่ายด้วยแอปธนาคาร ระบบจะยืนยันสิทธิ์หลังชำระสำเร็จ</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">PromptPay ต้องสแกนจ่ายใหม่ทุกรอบ ชื่อผู้รับเงินในแอปธนาคารจะแสดงเป็น STRIPE PAYMENTS (THAILAND) LTD</p>
        {!loading && !available && <p className="text-sm text-amber-700" role="status">ยังไม่เปิดรับ PromptPay ผู้ให้บริการกำลังเตรียมข้อมูลรับชำระและออกเอกสาร</p>}
        {!saved && <p className="text-sm text-muted-foreground">กรุณาบันทึกข้อมูลออกบิลก่อนเลือกแพ็กเกจ</p>}
        <div className="grid gap-3 sm:grid-cols-3">{plans.map((plan) => <div key={plan.id} className="rounded-lg border p-4 space-y-3">
          <p className="font-medium">{plan.name}</p>
          <p className="text-sm">{Number(plan.amount).toLocaleString("th-TH", { minimumFractionDigits: 2 })} บาท / {plan.billing_interval === "annual" ? "ปี" : "เดือน"}</p>
          <Button className="w-full" variant="outline" disabled={loading || busy !== null || !available || !saved} onClick={() => void run(`promptpay-${plan.id}`, async () => {
            const payload = await post("promptpay", { plan: plan.id });
            redirectToStripe(String(payload?.url || ""));
          })}>{busy === `promptpay-${plan.id}` ? "กำลังเปิดบิล…" : "รับบิล / จ่าย PromptPay"}</Button>
        </div>)}</div>
      </CardContent>
    </Card>}
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div><CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" />ประวัติบิลและใบเสร็จ</CardTitle><CardDescription>ดาวน์โหลดเอกสาร PDF ภาษาไทยสำหรับแต่ละรอบบริการ</CardDescription></div>
        <Button size="sm" variant="outline" disabled={loading || busy !== null || !available} onClick={() => void run("refresh", async () => {
          await post("invoice-refresh");
          await loadInvoices();
          await onRefresh();
          setNotice("อัปเดตสถานะบิลแล้ว");
        })}><RefreshCw className={`h-4 w-4 mr-2 ${busy === "refresh" ? "animate-spin motion-reduce:animate-none" : ""}`} />อัปเดตสถานะ</Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {!loading && invoices.length === 0 && <p className="text-sm text-muted-foreground">ยังไม่มีใบแจ้งหนี้</p>}
        {invoices.map((invoice) => <div key={invoice.id} className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1"><p className="font-medium">{invoice.number} <span className="text-sm text-muted-foreground">{statusLabels[invoice.status] || invoice.status}</span></p>
            <p className="text-sm">{Number(invoice.total).toLocaleString("th-TH", { minimumFractionDigits: 2 })} {invoice.currency} · วันที่ {formatBillingDate(invoice.issued_at)}</p>
            {invoice.due_at && <p className="text-xs text-muted-foreground">กำหนดชำระ {formatBillingDate(invoice.due_at)}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            {invoice.status === "open" && <Button size="sm" disabled={busy !== null} onClick={() => void run(`pay-${invoice.id}`, async () => {
              const payload = await post("invoice-pay", { document_id: invoice.id });
              redirectToStripe(String(payload?.url || ""));
            })}>จ่ายบิลนี้</Button>}
            <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void run(`invoice-${invoice.id}`, () => download(invoice, "invoice"))}><Download className="mr-2 h-4 w-4" />ใบแจ้งหนี้</Button>
            {invoice.receipt_number && <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void run(`receipt-${invoice.id}`, () => download(invoice, "receipt"))}><Download className="mr-2 h-4 w-4" />ใบเสร็จ</Button>}
          </div>
        </div>)}
        {nextBefore && <Button variant="outline" disabled={busy !== null} onClick={() => void run("more", () => loadInvoices(nextBefore))}>ดูบิลก่อนหน้า</Button>}
      </CardContent>
    </Card>
  </section>;
}
