import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCompatServerSession: vi.fn(),
  fetchProperties: vi.fn(),
  sanitizeSessionForClient: vi.fn((session) => session),
}));

vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) => ({
      body,
      status: init?.status ?? 200,
      headers: init?.headers,
    }),
  },
}));

vi.mock("@/app/lib/auth0/server-session", () => ({
  getCompatServerSession: mocks.getCompatServerSession,
}));

vi.mock("@/app/lib/data.server", () => ({
  fetchProperties: mocks.fetchProperties,
}));

vi.mock("@/app/lib/auth0/session-cookie", () => ({
  sanitizeSessionForClient: mocks.sanitizeSessionForClient,
}));

vi.mock("@/app/lib/config", () => ({
  API_CONFIG: { baseUrl: "https://backend.example" },
  DEBUG_CONFIG: {
    logApiCalls: false,
    logAuth: false,
    logSessions: false,
  },
}));

import { GET } from "./route";

function property(id: number, propertyId: string, name: string) {
  return {
    id,
    tenant: 71,
    tenant_name: "Tenant 71",
    property_id: propertyId,
    name,
    description: null,
    users: [50],
    created_at: "2026-08-12T00:00:00Z",
    rooms: [],
    is_preventivemaintenance: true,
  };
}

const propertyA = property(1, "PROPERTY-A", "Hotel Alpha");
const propertyB = property(2, "PROPERTY-B", "Hotel Bravo");

const profile = {
  id: 90,
  profile_id: 90,
  user_id: 50,
  username: "multi-property-user",
  email: "multi@example.com",
  first_name: "Multi",
  last_name: "Property",
  display_name: "Multi Property",
  profile_image: null,
  positions: "Engineer",
  properties: [propertyB],
  user_property_name: null,
  user_property_id: null,
  profile_property_name: null,
  profile_property_id: null,
  created_at: "2026-08-12T00:00:00Z",
  email_notifications_enabled: true,
};

describe("GET /api/auth/session-compat", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.getCompatServerSession.mockResolvedValue({
      user: {
        id: "auth0|50",
        username: "multi-property-user",
        email: "multi@example.com",
        accessToken: "access-token",
        properties: [],
      },
    });
    mocks.fetchProperties.mockResolvedValue([propertyA]);
  });

  it("merges the display list without changing the canonical current-user DTO", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        ...profile,
        properties: [propertyB],
      }),
    }));

    const response = await GET() as unknown as { body: typeof profile & Record<string, unknown> };
    const body = response.body as unknown as {
      currentUser: { properties: typeof propertyA[] };
      user: { properties: typeof propertyA[] };
    };

    expect(body.currentUser.properties).toEqual([propertyB]);
    expect(body.user.properties).toEqual([propertyA, propertyB]);
  });

  it("keeps properties returned by the property endpoint when the profile request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));

    const response = await GET() as unknown as {
      body: { currentUser?: unknown; user: { properties: typeof propertyA[] } };
    };

    expect(response.body.currentUser).toBeUndefined();
    expect(response.body.user.properties).toEqual([propertyA]);
  });
});
