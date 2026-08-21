import type { Property } from '@/app/lib/types';

export type PropertyLike = Partial<Property> | string | number | null | undefined;
type UserPropertyScope = { properties?: Property[] | null };

export function getPropertyId(property: PropertyLike): string {
  if (property === null || property === undefined) return '';
  if (typeof property === 'string' || typeof property === 'number') return String(property);
  // API Property objects always expose the stable external identity. Numeric
  // Django `id` is deliberately not an object fallback because it is a
  // different namespace. Primitive values remain supported for legacy wire
  // arrays such as Room.properties[].
  const candidate = property.property_id;
  return candidate === null || candidate === undefined ? '' : String(candidate);
}

export function getAllowedUserProperties(userProfile: UserPropertyScope | null | undefined): Property[] {
  return Array.isArray(userProfile?.properties) ? userProfile.properties.filter((property) => !!getPropertyId(property)) : [];
}

export function isPropertyAllowedForUser(
  userProfile: UserPropertyScope | null | undefined,
  propertyId: string | number | null | undefined,
): boolean {
  const requestedPropertyId = propertyId === null || propertyId === undefined ? '' : String(propertyId);
  if (!requestedPropertyId) return true;

  const allowedProperties = getAllowedUserProperties(userProfile);
  return allowedProperties.some((property) => getPropertyId(property) === requestedPropertyId);
}

export function filterPropertiesForUser<T extends PropertyLike>(
  properties: T[] | null | undefined,
  userProfile: UserPropertyScope | null | undefined,
): T[] {
  const safeProperties = Array.isArray(properties) ? properties : [];
  const allowedProperties = getAllowedUserProperties(userProfile);
  const allowedIds = new Set(allowedProperties.map(getPropertyId));
  return safeProperties.filter((property) => allowedIds.has(getPropertyId(property)));
}

export function getDefaultPropertyId(
  properties: readonly PropertyLike[] | null | undefined,
): string | null {
  if (!Array.isArray(properties)) return null;
  for (const property of properties) {
    const propertyId = getPropertyId(property);
    if (propertyId) return propertyId;
  }
  return null;
}

export function getDefaultAuthorizedPropertyId(userProfile: UserPropertyScope | null | undefined): string | null {
  return getDefaultPropertyId(getAllowedUserProperties(userProfile));
}

export function getAuthorizedDashboardPath(userProfile: UserPropertyScope | null | undefined): string {
  const propertyId = getDefaultAuthorizedPropertyId(userProfile);
  return propertyId ? `/dashboard?property_id=${encodeURIComponent(propertyId)}` : '/dashboard/unauthorized';
}
