import type { ProfileFieldErrors, ProfilePatch } from "./profile";

export function buildProfilePatch(
  initial: ProfilePatch,
  current: ProfilePatch,
): Partial<ProfilePatch>;
export function hasProfileChanges(
  initial: ProfilePatch,
  current: ProfilePatch,
): boolean;
export function profileErrorMessage(
  payload: unknown,
  fallback?: string,
): string;
export function profileFieldErrors(payload: unknown): ProfileFieldErrors;
