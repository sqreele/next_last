"use client";

import { useLocale } from "@/app/lib/i18n/LocaleProvider";
import { billingStatusKey } from "@/app/lib/i18n/billing-status";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/app/components/ui/card";
import { rows } from "@/app/lib/billing-ui.mjs";

type Tenant = { tenant_id: string };

export default function BillingSuccessClient() {
  const { t } = useLocale();
  const statusLabel = (status: string) => t(billingStatusKey(status));
  const [status, setStatus] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const tenantResponse = await fetch("/api/billing/tenants", { cache: "no-store" });
    const tenantPayload = await tenantResponse.json().catch(() => null);
    const selectedId = new URLSearchParams(window.location.search).get("tenant_id");
    const available = rows<Tenant>(tenantPayload);
    const tenant = available.find((item) => item.tenant_id === selectedId) || (available.length === 1 ? available[0] : null);
    if (!tenantResponse.ok || !tenant) return;
    const response = await fetch(`/api/billing/status?tenant_id=${encodeURIComponent(tenant.tenant_id)}`, { cache: "no-store" });
    const payload = await response.json().catch(() => null);
    if (response.ok && typeof payload?.status === "string") setStatus(
      payload.entitlement_level === "FULL" ? payload.status : "awaiting_payment",
    );
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 3000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  return (
    <div className="mx-auto grid min-h-[60vh] max-w-xl place-items-center p-4">
      <Card className="w-full">
        <CardHeader><CardTitle>{t("billing.paymentConfirmation")}</CardTitle><CardDescription>{t("billing.confirmSubscription")}</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{t("billing.paymentVerification")}</p>
          {status && <div className="flex items-center gap-2 text-sm">{t("billing.currentStatus")} <Badge variant="secondary">{statusLabel(status)}</Badge></div>}
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap"><Button onClick={() => void refresh()}>{t("billing.checkAgain")}</Button><Button asChild variant="outline"><Link href="/dashboard/settings/billing">{t("billing.settings")}</Link></Button></div>
        </CardContent>
      </Card>
    </div>
  );
}
