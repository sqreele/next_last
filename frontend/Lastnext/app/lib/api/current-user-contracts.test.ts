import { describe, expect, it } from "vitest";
import {
  currentUserProfileRouteId,
  currentUserTargetId,
  isCurrentUserResponse,
  type CurrentUserResponse,
} from "./current-user-contracts";

const currentUser: CurrentUserResponse = {
  id: 83,
  user_id: 41,
  profile_id: 83,
  username: "current-user",
  email: "current@example.com",
  first_name: "Current",
  last_name: "User",
  display_name: "Current User",
  profile_image: null,
  positions: null,
  properties: [
    {
      id: 7,
      tenant: 2,
      tenant_name: "Tenant Two",
      property_id: "P00000007",
      name: "Hotel Seven",
      description: null,
      users: [41],
      created_at: "2026-08-11T00:00:00Z",
      rooms: [],
      is_preventivemaintenance: null,
    },
  ],
  user_property_name: null,
  user_property_id: null,
  profile_property_name: null,
  profile_property_id: null,
  created_at: "2026-08-11T00:00:00Z",
  email_notifications_enabled: true,
};

describe("current-user identity contract", () => {
  it("accepts the canonical backend response and nullable profile fields", () => {
    expect(isCurrentUserResponse(currentUser)).toBe(true);
  });

  it("keeps User, UserProfile, and Auth0 identities distinct", () => {
    const authSubject = "auth0|external-subject";

    expect(currentUser.user_id).toBe(41);
    expect(currentUser.profile_id).toBe(83);
    expect(currentUser.user_id).not.toBe(currentUser.profile_id);
    expect(String(currentUser.user_id)).not.toBe(authSubject);
    expect(String(currentUser.profile_id)).not.toBe(authSubject);
  });

  it("uses user_id for User-target write payloads", () => {
    expect(currentUserTargetId(currentUser)).toBe(41);
    expect(currentUserTargetId(currentUser)).not.toBe(currentUser.id);
  });

  it("uses profile_id for profile routes", () => {
    expect(currentUserProfileRouteId(currentUser)).toBe(83);
    expect(currentUserProfileRouteId(currentUser)).not.toBe(currentUser.user_id);
  });

  it("preserves legacy id only as the documented profile identity", () => {
    expect(currentUser.id).toBe(currentUser.profile_id);
    expect(currentUser.id).not.toBe(currentUser.user_id);
  });

  it("rejects responses whose legacy id conflicts with profile_id", () => {
    expect(isCurrentUserResponse({ ...currentUser, id: 41 })).toBe(false);
  });

  it("preserves the scoped property-access representation", () => {
    expect(currentUser.properties).toEqual([
      expect.objectContaining({
        id: 7,
        property_id: "P00000007",
        tenant: 2,
      }),
    ]);
  });

  it("does not reuse the AssigneeRef DTO as CurrentUser", () => {
    const assigneeShape = {
      user_id: 41,
      profile_id: 83,
      username: "current-user",
      properties: [],
    };

    expect(isCurrentUserResponse(assigneeShape)).toBe(false);
  });
});
