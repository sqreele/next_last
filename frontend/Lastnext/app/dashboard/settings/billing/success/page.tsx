"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/app/components/ui/card";
import { billingStatusLabel, rows } from "@/app/lib/billing-ui.mjs";

type Tenant = { tenant_id: string };

export default function BillingSuccessPage() {
  const [status, setStatus] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const tenantResponse = await fetch("/api/billing/tenants", { cache: "no-store" });
    const tenantPayload = await tenantResponse.json().catch(() => null);
    const tenant = rows<Tenant>(tenantPayload)[0];
    if (!tenantResponse.ok || !tenant) return;
    const response = await fetch(`/api/billing/status?tenant_id=${encodeURIComponent(tenant.tenant_id)}`, { cache: "no-store" });
    const payload = await response.json().catch(() => null);
    if (response.ok && typeof payload?.status === "string") setStatus(payload.status);
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 3000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  return (
    <div className="mx-auto grid min-h-[60vh] max-w-xl place-items-center p-4">
      <Card className="w-full">
        <CardHeader><CardTitle>Payment received</CardTitle><CardDescription>We&apos;re confirming your subscription.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">Stripe&apos;s verified webhook remains the authority. This page does not activate your subscription.</p>
          {status && <div className="flex items-center gap-2 text-sm">Current status <Badge variant="secondary">{billingStatusLabel(status)}</Badge></div>}
          <div className="flex gap-2"><Button onClick={() => void refresh()}>Check again</Button><Button asChild variant="outline"><Link href="/dashboard/settings/billing">Billing settings</Link></Button></div>
        </CardContent>
      </Card>
    </div>
  );
}
