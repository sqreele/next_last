export function canAccessPlatform(profile, capability) {
  if (!profile || typeof capability !== "string" || !capability) return false;
  return Array.isArray(profile.platform_capabilities)
    && profile.platform_capabilities.includes(capability);
}

export function isPlatformUser(profile) {
  return profile?.is_platform_user === true;
}
