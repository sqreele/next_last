export interface CurrentUserPropertyAccess {
  id: number;
  tenant: number | null;
  tenant_name: string | null;
  property_id: string;
  name: string;
  description: string | null;
  users: number[];
  created_at: string;
  rooms: Array<{
    room_id: number;
    name: string;
    room_type: string;
    properties: string[];
  }>;
  is_preventivemaintenance: boolean | null;
}

export interface UserProfileApiResponse {
  /** Legacy identity: UserProfile primary key. */
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  display_name: string;
  profile_image: string | null;
  positions: string | null;
  properties: CurrentUserPropertyAccess[];
  user_property_name: string | null;
  user_property_id: string | null;
  profile_property_name: string | null;
  profile_property_id: string | null;
  created_at: string;
  email_notifications_enabled: boolean;
}

export interface CurrentUserResponse extends UserProfileApiResponse {
  user_id: number;
  profile_id: number;
}

export function currentUserTargetId(currentUser: CurrentUserResponse): number {
  return currentUser.user_id;
}

export function currentUserProfileRouteId(currentUser: CurrentUserResponse): number {
  return currentUser.profile_id;
}

function isPropertyAccess(value: unknown): value is CurrentUserPropertyAccess {
  if (typeof value !== "object" || value === null) return false;
  return (
    "id" in value &&
    typeof value.id === "number" &&
    "property_id" in value &&
    typeof value.property_id === "string" &&
    "name" in value &&
    typeof value.name === "string" &&
    "tenant" in value &&
    (typeof value.tenant === "number" || value.tenant === null) &&
    "tenant_name" in value &&
    (typeof value.tenant_name === "string" || value.tenant_name === null) &&
    "description" in value &&
    (typeof value.description === "string" || value.description === null) &&
    "users" in value &&
    Array.isArray(value.users) &&
    value.users.every((id) => typeof id === "number") &&
    "created_at" in value &&
    typeof value.created_at === "string" &&
    "rooms" in value &&
    Array.isArray(value.rooms) &&
    "is_preventivemaintenance" in value &&
    (typeof value.is_preventivemaintenance === "boolean" ||
      value.is_preventivemaintenance === null)
  );
}

function hasNullableString(value: object, key: string): boolean {
  return key in value &&
    (typeof value[key as keyof typeof value] === "string" ||
      value[key as keyof typeof value] === null);
}

export function isCurrentUserResponse(value: unknown): value is CurrentUserResponse {
  if (typeof value !== "object" || value === null) return false;
  return (
    "id" in value &&
    typeof value.id === "number" &&
    "user_id" in value &&
    typeof value.user_id === "number" &&
    "profile_id" in value &&
    typeof value.profile_id === "number" &&
    value.id === value.profile_id &&
    "username" in value &&
    typeof value.username === "string" &&
    "email" in value &&
    typeof value.email === "string" &&
    "first_name" in value &&
    typeof value.first_name === "string" &&
    "last_name" in value &&
    typeof value.last_name === "string" &&
    "display_name" in value &&
    typeof value.display_name === "string" &&
    "positions" in value &&
    (typeof value.positions === "string" || value.positions === null) &&
    "profile_image" in value &&
    (typeof value.profile_image === "string" || value.profile_image === null) &&
    "properties" in value &&
    Array.isArray(value.properties) &&
    value.properties.every(isPropertyAccess) &&
    hasNullableString(value, "user_property_name") &&
    hasNullableString(value, "user_property_id") &&
    hasNullableString(value, "profile_property_name") &&
    hasNullableString(value, "profile_property_id") &&
    "created_at" in value &&
    typeof value.created_at === "string" &&
    "email_notifications_enabled" in value &&
    typeof value.email_notifications_enabled === "boolean"
  );
}
