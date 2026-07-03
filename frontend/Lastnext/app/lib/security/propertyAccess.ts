import type { Property, UserProfile } from '@/app/lib/types';

export type PropertyLike = Partial<Property> | string | number | null | undefined;

export function getPropertyId(property: PropertyLike): string {
  if (property === null || property === undefined) return '';
  if (typeof property === 'string' || typeof property === 'number') return String(property);
  const candidate = property.property_id ?? property.id;
  return candidate === null || candidate === undefined ? '' : String(candidate);
}

export function getAllowedUserProperties(userProfile: UserProfile | null | undefined): Property[] {
  return Array.isArray(userProfile?.properties) ? userProfile.properties.filter((property) => !!getPropertyId(property)) : [];
}

export function userHasPropertyRestrictions(userProfile: UserProfile | null | undefined): boolean {
  return getAllowedUserProperties(userProfile).length > 0;
}

export function isPropertyAllowedForUser(
  userProfile: UserProfile | null | undefined,
  propertyId: string | number | null | undefined,
): boolean {
  const requestedPropertyId = propertyId === null || propertyId === undefined ? '' : String(propertyId);
  if (!requestedPropertyId) return true;

  const allowedProperties = getAllowedUserProperties(userProfile);
  if (allowedProperties.length === 0) return true;

  return allowedProperties.some((property) => getPropertyId(property) === requestedPropertyId);
}

export function filterPropertiesForUser<T extends PropertyLike>(
  properties: T[] | null | undefined,
  userProfile: UserProfile | null | undefined,
): T[] {
  const safeProperties = Array.isArray(properties) ? properties : [];
  const allowedProperties = getAllowedUserProperties(userProfile);
  if (allowedProperties.length === 0) return safeProperties;

  const allowedIds = new Set(allowedProperties.map(getPropertyId));
  return safeProperties.filter((property) => allowedIds.has(getPropertyId(property)));
}

export function getDefaultAuthorizedPropertyId(userProfile: UserProfile | null | undefined): string | null {
  const firstProperty = getAllowedUserProperties(userProfile)[0];
  return firstProperty ? getPropertyId(firstProperty) : null;
}

export function getAuthorizedDashboardPath(userProfile: UserProfile | null | undefined): string {
  const propertyId = getDefaultAuthorizedPropertyId(userProfile);
  return propertyId ? `/dashboard?property_id=${encodeURIComponent(propertyId)}` : '/dashboard/unauthorized';
}
