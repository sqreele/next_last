export type EntitlementLevel = "FULL" | "GRACE" | "READ_ONLY" | "BILLING_ONLY";

export interface SubscriptionEntitlement {
  tenant_id: string;
  status: string;
  entitlement_level: EntitlementLevel;
  can_read: boolean;
  can_write: boolean;
  can_manage_billing: boolean;
  reason_code: string;
  grace_ends_at: string | null;
  current_period_end: string | null;
  enforcement_mode: "off" | "observe" | "enforce";
}

export interface SubscriptionWarning {
  tone: "warning" | "attention";
  message: string;
  contact: string;
}

export function getSubscriptionWarning(
  entitlement: SubscriptionEntitlement | null | undefined,
  graceDateLabel?: string,
): SubscriptionWarning | null;
