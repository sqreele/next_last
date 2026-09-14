import type { CurrentUserProfile } from "./profile";

export const BILLING_ACCESS_ROLES: ReadonlySet<string>;
export function canAccessBilling(
  profile: Pick<CurrentUserProfile, "memberships" | "is_platform_superuser"> | null | undefined,
): boolean;
export function filterBillingNavigationItems<T extends { requiredCapability?: "billing" }>(
  items: readonly T[],
  allowed: boolean,
): T[];
export function filterBillingNavigationGroups<
  T extends { items: readonly { requiredCapability?: "billing" }[] },
>(groups: readonly T[], allowed: boolean): T[];
