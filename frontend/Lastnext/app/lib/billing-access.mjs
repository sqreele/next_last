export const BILLING_ACCESS_ROLES = new Set(["admin", "manager"]);

export function canAccessBilling(profile) {
  if (!profile) return false;
  if (profile.is_platform_superuser === true) return true;
  return Array.isArray(profile.memberships) && profile.memberships.some(
    (membership) =>
      membership?.is_active !== false && BILLING_ACCESS_ROLES.has(membership?.role),
  );
}

export function filterBillingNavigationItems(items, allowed) {
  return items.filter(
    (item) => item.requiredCapability !== "billing" || allowed,
  );
}

export function filterBillingNavigationGroups(groups, allowed) {
  return groups
    .map((group) => ({
      ...group,
      items: filterBillingNavigationItems(group.items, allowed),
    }))
    .filter((group) => group.items.length > 0);
}
