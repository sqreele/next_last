import type { CurrentUserProfile } from "./profile";
import type {
  NavigationGroup,
  NavigationItem,
} from "../design-system/navigation-config";

export const BILLING_ACCESS_ROLES: ReadonlySet<string>;
export function canAccessBilling(profile: CurrentUserProfile | null | undefined): boolean;
export function filterBillingNavigationItems<T extends NavigationItem>(
  items: readonly T[],
  allowed: boolean,
): T[];
export function filterBillingNavigationGroups<T extends NavigationGroup>(
  groups: readonly T[],
  allowed: boolean,
): Array<T & { items: NavigationItem[] }>;
