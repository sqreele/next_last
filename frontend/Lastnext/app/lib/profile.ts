export type ProfileProperty = {
  property_id: string;
  name: string;
};

export type ProfileMembership = {
  tenant_id: string;
  tenant_name: string;
  role: string;
  access_scope: "tenant_wide" | "granted";
  properties: ProfileProperty[];
};

export type CurrentUserProfile = {
  username: string;
  email: string | null;
  first_name: string;
  last_name: string;
  display_name: string;
  profile_image: string | null;
  positions: string | null;
  created_at: string;
  email_notifications_enabled: boolean;
  properties: ProfileProperty[];
  memberships: ProfileMembership[];
  is_platform_superuser: boolean;
};

export type ProfilePatch = Pick<
  CurrentUserProfile,
  "first_name" | "last_name" | "positions"
>;

export type ProfileFieldErrors = Partial<Record<keyof ProfilePatch, string>>;
