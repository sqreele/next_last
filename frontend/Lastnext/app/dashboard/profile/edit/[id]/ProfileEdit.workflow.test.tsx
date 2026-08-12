import * as React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentUserResponse } from "@/app/lib/api/current-user-contracts";
import EditProfilePage from "./page";
import ProfilePage from "../../page";

const mocks = vi.hoisted(() => ({
  routeId: "707",
  userProfile: null as CurrentUserResponse | null,
  selectedPropertyId: "PROPERTY-A-303" as string | null,
  setUserProfile: vi.fn(),
  setSelectedPropertyId: vi.fn(),
  routerPush: vi.fn(),
  routerReplace: vi.fn(),
  sessionUser: {
    id: "auth0|profile-user",
    username: "Profile User",
    email: "profile@example.com",
    accessToken: "profile-access-token",
    profile_image: null,
    positions: "Engineer",
    properties: [] as Array<Record<string, unknown>>,
    created_at: "2026-01-01T00:00:00Z",
  },
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: mocks.routeId }),
  useRouter: () => ({
    push: mocks.routerPush,
    replace: mocks.routerReplace,
  }),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/image", () => ({
  default: ({ alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} {...props} />
  ),
}));

vi.mock("@/app/lib/stores/mainStore", () => ({
  useUser: () => ({
    userProfile: mocks.userProfile,
    selectedPropertyId: mocks.selectedPropertyId,
    setUserProfile: mocks.setUserProfile,
    setSelectedPropertyId: mocks.setSelectedPropertyId,
  }),
  useProperties: () => ({
    properties: mocks.userProfile?.properties ?? [],
    propertyLoading: false,
  }),
}));

vi.mock("@/app/lib/hooks/useSessionGuard", () => ({
  useSessionGuard: () => ({
    isAuthenticated: true,
    isLoading: false,
    user: mocks.sessionUser,
    accessToken: mocks.sessionUser.accessToken,
    redirectToLogin: vi.fn(),
  }),
}));

vi.mock("@/app/lib/hooks/useMinLoaderTime", () => ({
  useMinLoaderTime: (
    setLoading: React.Dispatch<React.SetStateAction<boolean>>,
  ) => ({
    recordLoaderShown: vi.fn(),
    clearLoadingAfterMinTime: () => setLoading(false),
  }),
}));

const propertyA = {
  id: 303,
  tenant: 51,
  tenant_name: "Tenant Alpha",
  property_id: "PROPERTY-A-303",
  name: "Property Alpha",
  description: null,
  users: [101],
  created_at: "2026-01-01T00:00:00Z",
  rooms: [],
  is_preventivemaintenance: null,
};

const propertyB = {
  ...propertyA,
  id: 404,
  property_id: "PROPERTY-B-404",
  name: "Property Beta",
};

const profileA: CurrentUserResponse = {
  id: 707,
  user_id: 101,
  profile_id: 707,
  username: "Profile User",
  email: "profile@example.com",
  first_name: "Profile",
  last_name: "User",
  display_name: "Profile User",
  profile_image: null,
  positions: "Engineer",
  properties: [propertyA, propertyB],
  user_property_name: null,
  user_property_id: null,
  profile_property_name: null,
  profile_property_id: null,
  created_at: "2026-01-01T00:00:00Z",
  email_notifications_enabled: true,
};

const profileB: CurrentUserResponse = {
  ...profileA,
  id: 808,
  user_id: 202,
  profile_id: 808,
  username: "Second User",
  email: "second@example.com",
  first_name: "Second",
  last_name: "User",
  display_name: "Second User",
  positions: "Manager",
  properties: [propertyB],
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function serverProfile(
  overrides: Partial<CurrentUserResponse> = {},
): Record<string, unknown> {
  const profile: Record<string, unknown> = {
    ...profileA,
    ...overrides,
  };
  delete profile.user_id;
  delete profile.profile_id;
  return profile;
}

function installFetch(
  mutation: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/api/auth/session-compat")) {
      return Promise.resolve(jsonResponse({
        user: {
          id: mocks.sessionUser.id,
          accessToken: mocks.sessionUser.accessToken,
        },
        currentUser: mocks.userProfile,
      }));
    }
    if (url.includes("/api/v1/csrf-token/")) {
      return Promise.resolve(jsonResponse({ csrfToken: "profile-csrf-token" }));
    }
    if (url.includes("/api/properties/")) {
      return Promise.resolve(jsonResponse([propertyA, propertyB]));
    }
    if (init?.method === "PATCH" || init?.method === "POST") {
      return mutation(input, init);
    }
    throw new Error(`Unexpected request: ${init?.method ?? "GET"} ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function mutationCalls(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.filter(([, init]) =>
    init?.method === "PATCH" || init?.method === "POST",
  );
}

function positionsInput() {
  return screen.getByLabelText("Position/Role") as HTMLInputElement;
}

beforeEach(() => {
  mocks.routeId = "707";
  mocks.userProfile = { ...profileA, properties: [...profileA.properties] };
  mocks.selectedPropertyId = "PROPERTY-A-303";
  mocks.routerPush.mockReset();
  mocks.routerReplace.mockReset();
  mocks.setUserProfile.mockReset();
  mocks.setUserProfile.mockImplementation((profile: CurrentUserResponse | null) => {
    mocks.userProfile = profile;
  });
  mocks.setSelectedPropertyId.mockReset();
  mocks.setSelectedPropertyId.mockImplementation((propertyId: string | null) => {
    mocks.selectedPropertyId = propertyId;
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("active Profile Edit identity and mutation workflow", () => {
  it("links to the canonical profile_id rather than the Auth0 subject or user_id", async () => {
    installFetch(async () => jsonResponse(serverProfile()));
    render(<ProfilePage />);

    const editLink = await screen.findByRole("link", { name: "Edit Profile" });
    expect(editLink).toHaveAttribute("href", "/dashboard/profile/edit/707");
    expect(editLink).not.toHaveAttribute("href", expect.stringContaining("101"));
    expect(editLink).not.toHaveAttribute(
      "href",
      expect.stringContaining("auth0|profile-user"),
    );
  });

  it("hydrates the canonical profile and keeps server-managed fields read-only", () => {
    installFetch(async () => jsonResponse(serverProfile()));
    render(<EditProfilePage />);

    expect(screen.getByLabelText("Username")).toHaveValue("Profile User");
    expect(screen.getByLabelText("Email Address")).toHaveValue("profile@example.com");
    expect(positionsInput()).toHaveValue("Engineer");
    expect(screen.getByLabelText("Username")).toHaveAttribute("readonly");
    expect(screen.getByLabelText("Email Address")).toHaveAttribute("readonly");
    expect(positionsInput()).not.toHaveAttribute("readonly");
    expect(screen.queryByText("Access Denied")).not.toBeInTheDocument();
  });

  it.each(["101", "auth0|profile-user"])(
    "rejects non-profile route identity %s without sending a mutation",
    (routeIdentity) => {
      mocks.routeId = routeIdentity;
      const fetchMock = installFetch(async () => jsonResponse(serverProfile()));

      render(<EditProfilePage />);

      expect(screen.getByText("Access Denied")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Save Changes" })).not.toBeInTheDocument();
      expect(mutationCalls(fetchMock)).toHaveLength(0);
    },
  );

  it("sends one exact profile PATCH with only mutable data and reconciles from the server", async () => {
    let resolveMutation!: (response: Response) => void;
    const fetchMock = installFetch(
      () => new Promise<Response>((resolve) => { resolveMutation = resolve; }),
    );
    const view = render(<EditProfilePage />);

    fireEvent.change(positionsInput(), { target: { value: "Senior Engineer" } });
    const save = screen.getByRole("button", { name: "Save Changes" });
    fireEvent.click(save);
    fireEvent.click(save);

    await waitFor(() => expect(mutationCalls(fetchMock)).toHaveLength(1));
    const [url, request] = mutationCalls(fetchMock)[0] as [string, RequestInit];
    expect(new URL(String(url)).pathname).toBe("/api/v1/user-profiles/707/");
    expect(request.method).toBe("PATCH");
    expect(request.credentials).toBe("include");
    expect(request.headers).toEqual(expect.objectContaining({
      Authorization: "Bearer profile-access-token",
      "Content-Type": "application/json",
      "X-CSRFToken": "profile-csrf-token",
    }));
    expect(JSON.parse(String(request.body))).toEqual({
      positions: "Senior Engineer",
    });
    expect(String(request.body)).not.toContain("user_id");
    expect(String(request.body)).not.toContain("profile_id");
    expect(String(request.body)).not.toContain("auth0");
    expect(String(request.body)).not.toContain("is_staff");
    expect(String(request.body)).not.toContain("permissions");
    expect(String(request.body)).not.toContain("properties");
    expect(mocks.setUserProfile).not.toHaveBeenCalled();
    expect(screen.queryByText(/Profile updated successfully/)).not.toBeInTheDocument();
    expect(positionsInput()).toHaveValue("Senior Engineer");
    expect(screen.getByRole("button", { name: "Saving..." })).toBeDisabled();

    resolveMutation(jsonResponse(serverProfile({
      username: "Canonical Profile User",
      email: "canonical@example.com",
      positions: "Senior Engineer",
    })));

    await screen.findByText(/Profile updated successfully/);
    expect(mocks.setUserProfile).toHaveBeenCalledTimes(1);
    expect(mocks.setUserProfile).toHaveBeenCalledWith(expect.objectContaining({
      id: 707,
      user_id: 101,
      profile_id: 707,
      username: "Canonical Profile User",
      email: "canonical@example.com",
      positions: "Senior Engineer",
    }));

    view.unmount();
    render(<EditProfilePage />);
    expect(screen.getByLabelText("Username")).toHaveValue("Canonical Profile User");
    expect(screen.getByLabelText("Email Address")).toHaveValue("canonical@example.com");
    expect(positionsInput()).toHaveValue("Senior Engineer");
  });

  it("preserves edits after 400 and retries once with the latest intended payload", async () => {
    let attempt = 0;
    const fetchMock = installFetch(async () => {
      attempt += 1;
      if (attempt === 1) {
        return jsonResponse({ positions: ["Position is not valid."] }, 400);
      }
      return jsonResponse(serverProfile({ positions: "Lead Engineer" }));
    });
    render(<EditProfilePage />);

    fireEvent.change(positionsInput(), { target: { value: "Invalid Position" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await screen.findByText(/An error occurred while updating your profile/);
    expect(positionsInput()).toHaveValue("Invalid Position");
    expect(mocks.setUserProfile).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Save Changes" })).toBeEnabled();

    fireEvent.change(positionsInput(), { target: { value: "Lead Engineer" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await screen.findByText(/Profile updated successfully/);
    expect(mutationCalls(fetchMock)).toHaveLength(2);
    expect(JSON.parse(String(mutationCalls(fetchMock)[0][1]?.body))).toEqual({
      positions: "Invalid Position",
    });
    expect(JSON.parse(String(mutationCalls(fetchMock)[1][1]?.body))).toEqual({
      positions: "Lead Engineer",
    });
  });

  it("rejects a successful response carrying a different profile identity", async () => {
    const fetchMock = installFetch(async () =>
      jsonResponse(serverProfile({ id: 808, positions: "Wrong Profile" })),
    );
    render(<EditProfilePage />);

    fireEvent.change(positionsInput(), { target: { value: "Expected Profile" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await screen.findByText(/Profile update response identity mismatch/);
    expect(mutationCalls(fetchMock)).toHaveLength(1);
    expect(mocks.setUserProfile).not.toHaveBeenCalled();
    expect(positionsInput()).toHaveValue("Expected Profile");
    expect(screen.queryByText(/Profile updated successfully/)).not.toBeInTheDocument();
  });

  it("preserves editable and current-user state after 403", async () => {
    const fetchMock = installFetch(async () =>
      jsonResponse({ detail: "You may not edit this profile." }, 403),
    );
    render(<EditProfilePage />);

    fireEvent.change(positionsInput(), { target: { value: "Unauthorized Role" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await screen.findByText(/You may not edit this profile/);
    expect(mutationCalls(fetchMock)).toHaveLength(1);
    expect(positionsInput()).toHaveValue("Unauthorized Role");
    expect(mocks.setUserProfile).not.toHaveBeenCalled();
    expect(mocks.selectedPropertyId).toBe("PROPERTY-A-303");
    expect(screen.queryByText(/Profile updated successfully/)).not.toBeInTheDocument();
  });

  it("recovers from a network failure without discarding edits or retrying automatically", async () => {
    const fetchMock = installFetch(async () => {
      throw new TypeError("fetch failed");
    });
    render(<EditProfilePage />);

    fireEvent.change(positionsInput(), { target: { value: "Network Draft" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await screen.findByText(/fetch failed/);
    expect(mutationCalls(fetchMock)).toHaveLength(1);
    expect(positionsInput()).toHaveValue("Network Draft");
    expect(screen.getByRole("button", { name: "Save Changes" })).toBeEnabled();
    expect(mocks.setUserProfile).not.toHaveBeenCalled();
  });

  it("keeps profile identity independent from a property switch", async () => {
    let resolveMutation!: (response: Response) => void;
    const fetchMock = installFetch(
      () => new Promise<Response>((resolve) => { resolveMutation = resolve; }),
    );
    const view = render(<EditProfilePage />);

    fireEvent.change(positionsInput(), { target: { value: "Property Independent" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    await waitFor(() => expect(mutationCalls(fetchMock)).toHaveLength(1));

    mocks.selectedPropertyId = "PROPERTY-B-404";
    view.rerender(<EditProfilePage />);
    resolveMutation(jsonResponse(serverProfile({ positions: "Property Independent" })));

    await screen.findByText(/Profile updated successfully/);
    expect(new URL(String(mutationCalls(fetchMock)[0][0])).pathname).toBe(
      "/api/v1/user-profiles/707/",
    );
    expect(mocks.selectedPropertyId).toBe("PROPERTY-B-404");
    expect(mocks.setSelectedPropertyId).not.toHaveBeenCalled();
  });

  it("ignores a stale User A response after User B becomes active", async () => {
    let resolveMutation!: (response: Response) => void;
    const fetchMock = installFetch(
      () => new Promise<Response>((resolve) => { resolveMutation = resolve; }),
    );
    const view = render(<EditProfilePage />);

    fireEvent.change(positionsInput(), { target: { value: "User A Pending" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    await waitFor(() => expect(mutationCalls(fetchMock)).toHaveLength(1));

    mocks.userProfile = { ...profileB };
    view.rerender(<EditProfilePage />);
    expect(screen.getByText("Access Denied")).toBeInTheDocument();

    resolveMutation(jsonResponse(serverProfile({ positions: "User A Saved" })));
    await act(async () => {});

    expect(mocks.setUserProfile).not.toHaveBeenCalled();
    expect(screen.queryByText(/Profile updated successfully/)).not.toBeInTheDocument();
    expect(mocks.userProfile).toEqual(profileB);
  });

  it("cancels through the profile route without sending a mutation", () => {
    const fetchMock = installFetch(async () => jsonResponse(serverProfile()));
    render(<EditProfilePage />);

    fireEvent.change(positionsInput(), { target: { value: "Unsaved Position" } });
    const cancel = screen.getByRole("link", { name: "Cancel" });

    expect(cancel).toHaveAttribute("href", "/dashboard/profile");
    expect(mutationCalls(fetchMock)).toHaveLength(0);
    expect(mocks.setUserProfile).not.toHaveBeenCalled();
    expect(mocks.userProfile?.positions).toBe("Engineer");
  });
});
