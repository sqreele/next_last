export const platformNavigationItems = [
  { href: "/platform", label: "Overview", capability: "platform.tenants.read" },
  { href: "/platform/tenants", label: "Tenants", capability: "platform.tenants.read" },
  { href: "/platform/subscriptions", label: "Subscriptions", capability: "platform.billing.read" },
  { href: "/platform/usage", label: "Usage", capability: "platform.usage.read" },
  { href: "/platform/webhook-events", label: "Webhook Events", capability: "platform.billing.diagnostics.read" },
];

export function visiblePlatformNavigation(profile) {
  const capabilities = Array.isArray(profile?.platform_capabilities) ? profile.platform_capabilities : [];
  return platformNavigationItems.filter((item) => capabilities.includes(item.capability));
}
