import type { CurrentUserProfile } from "./profile";

export function canAccessPlatform(
  profile: Pick<CurrentUserProfile, "platform_capabilities"> | null | undefined,
  capability: string,
): boolean;
export function isPlatformUser(
  profile: Pick<CurrentUserProfile, "is_platform_user"> | null | undefined,
): boolean;
