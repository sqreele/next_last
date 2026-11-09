import type { DictKey } from "./i18n/dictionary";
export function rows<T>(payload: T[] | { results?: T[] } | null): T[];
export function billingStatusLabel(status: string): string;
export function formatBillingDate(value: string | null | undefined, locale?: string): string;
export function formatBillingDateTime(value: string | null | undefined, timeZone?: string, locale?: string): string;
export interface BillingLifecycleState {
  status: string;
  entitlement_level: string;
  reason_code: string;
  current_period_end: string | null;
  trial_ends_at: string | null;
  grace_period_ends_at: string | null;
  cancel_at_period_end: boolean;
}
export interface BillingLifecycleMessage {
  tone: 'neutral' | 'warning' | 'attention';
  message: string;
}
export interface LifecycleDisplay {
  label: 'Trial expires' | 'Renews' | 'Access until' | 'Grace until' | 'Access ended' | 'Expiry date unavailable';
  date: string | null;
  message: string;
}
export function getLifecycleDisplay(
  billing: BillingLifecycleState | Record<string, unknown> | null | undefined,
  timeZone?: string,
  now?: Date,
): LifecycleDisplay;
export function getBillingLifecycleMessage(
  billing: BillingLifecycleState | null | undefined,
  locale?: string,
  translate?: (key: DictKey, values?: Record<string, string | number>) => string,
): BillingLifecycleMessage | null;
export function isSafeStripeHostedUrl(value: string): boolean;
export function redirectToStripe(value: string, locationObject?: { assign(value: string): void }): void;
