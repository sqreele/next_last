"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";
import { useMainStore } from "@/app/lib/stores/mainStore";
import {
  getSubscriptionWarning,
  type SubscriptionEntitlement,
} from "@/app/lib/subscription-warning.mjs";

export function SubscriptionWarningBanner() {
  const propertyId = useMainStore((state) => state.selectedPropertyId);
  const [entitlement, setEntitlement] = React.useState<SubscriptionEntitlement | null>(null);

  React.useEffect(() => {
    setEntitlement(null);
    if (!propertyId) return;

    const controller = new AbortController();
    void fetch(
      `/api/v1/tenant-subscriptions/entitlement/?property_id=${encodeURIComponent(propertyId)}`,
      { cache: "no-store", credentials: "include", signal: controller.signal },
    )
      .then(async (response) => {
        if (!response.ok) return null;
        return response.json() as Promise<SubscriptionEntitlement>;
      })
      .then((payload) => {
        if (payload) setEntitlement(payload);
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setEntitlement(null);
        }
      });

    return () => controller.abort();
  }, [propertyId]);

  const graceDateLabel = React.useMemo(() => {
    if (!entitlement?.grace_ends_at) return undefined;
    const date = new Date(entitlement.grace_ends_at);
    return Number.isNaN(date.getTime())
      ? entitlement.grace_ends_at
      : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
  }, [entitlement?.grace_ends_at]);
  const warning = getSubscriptionWarning(entitlement, graceDateLabel);
  if (!warning) return null;

  return (
    <div
      role="status"
      data-entitlement-level={entitlement?.entitlement_level}
      className="flex items-start gap-3 border-b border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-100"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <p>
        <span className="font-semibold">{warning.message}</span>{" "}
        <span>{warning.contact}</span>
      </p>
    </div>
  );
}
