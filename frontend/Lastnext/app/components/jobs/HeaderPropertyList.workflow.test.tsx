import * as React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PropertyAccessGuard } from "@/app/components/auth/PropertyAccessGuard";
import { useMainStore } from "@/app/lib/stores/mainStore";
import { useAuthStore } from "@/app/lib/stores/useAuthStore";
import type {
  CurrentUserPropertyAccess,
  CurrentUserResponse,
} from "@/app/lib/api/current-user-contracts";
import HeaderPropertyList from "./HeaderPropertyList";

const mocks = vi.hoisted(() => ({
  pathname: "/dashboard",
  searchParams: new URLSearchParams("property_id=PROPERTY-A"),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ replace: mocks.replace }),
  useSearchParams: () => mocks.searchParams,
}));

vi.mock("@/app/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick?: React.MouseEventHandler<HTMLButtonElement>;
  }) => <button type="button" onClick={onClick}>{children}</button>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

function property(
  id: number,
  propertyId: string,
  name: string,
): CurrentUserPropertyAccess {
  return {
    id,
    tenant: 71,
    tenant_name: "Tenant 71",
    property_id: propertyId,
    name,
    description: null,
    users: [501],
    created_at: "2026-08-12T00:00:00Z",
    rooms: [],
    is_preventivemaintenance: true,
  };
}

const propertyA = property(101, "PROPERTY-A", "Hotel Alpha");
const propertyB = property(202, "PROPERTY-B", "Hotel Bravo");
const propertyC = property(303, "PROPERTY-C", "Hotel Charlie");

function currentUser(properties: CurrentUserPropertyAccess[]): CurrentUserResponse {
  return {
    id: 901,
    user_id: 501,
    profile_id: 901,
    username: "multi-property-user",
    email: "multi@example.com",
    first_name: "Multi",
    last_name: "Property",
    display_name: "Multi Property",
    profile_image: null,
    positions: "Engineer",
    properties,
    user_property_name: null,
    user_property_id: null,
    profile_property_name: null,
    profile_property_id: null,
    created_at: "2026-08-12T00:00:00Z",
    email_notifications_enabled: true,
  };
}

beforeEach(() => {
  localStorage.clear();
  mocks.pathname = "/dashboard";
  mocks.searchParams = new URLSearchParams("property_id=PROPERTY-A");
  mocks.replace.mockReset();
  useMainStore.setState({
    userProfile: currentUser([propertyA, propertyB]),
    properties: [propertyA, propertyB],
    selectedPropertyId: "PROPERTY-A",
    propertyLoading: false,
  });
  useAuthStore.setState({ userProfile: null, selectedProperty: "PROPERTY-A" });
});

afterEach(() => {
  cleanup();
  useMainStore.setState({
    userProfile: null,
    properties: [],
    selectedPropertyId: null,
    propertyLoading: false,
  });
  useAuthStore.setState({ userProfile: null, selectedProperty: null });
  localStorage.clear();
  vi.clearAllMocks();
});

describe("Header property selection workflow", () => {
  it("keeps an authorized header selection when the dashboard URL still names the previous property", async () => {
    render(
      <PropertyAccessGuard>
        <HeaderPropertyList />
      </PropertyAccessGuard>,
    );

    const selector = screen.getByRole("button", { name: "Select property" });
    expect(selector).toBeEnabled();
    expect(selector).toHaveTextContent("Hotel Alpha");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Hotel Bravo" }));
      await Promise.resolve();
    });

    expect(useMainStore.getState().selectedPropertyId).toBe("PROPERTY-B");
    expect(selector).toHaveTextContent("Hotel Bravo");
    expect(mocks.replace).not.toHaveBeenCalled();

    const persistedMainStore = JSON.parse(localStorage.getItem("main-store") || "{}");
    const persistedAuthStore = JSON.parse(localStorage.getItem("auth-storage") || "{}");
    expect(persistedMainStore.state.selectedPropertyId).toBe("PROPERTY-B");
    expect(persistedAuthStore.state.selectedProperty).toBe("PROPERTY-B");
    expect(persistedMainStore.state.selectedPropertyId).not.toBe(propertyB.id);
  });

  it("restores the canonical property_id and invalidates it when access is removed", async () => {
    useMainStore.getState().setSelectedPropertyId("PROPERTY-B");
    const persisted = localStorage.getItem("main-store");
    expect(persisted).not.toBeNull();

    useMainStore.setState({ selectedPropertyId: null });
    localStorage.setItem("main-store", persisted!);
    await useMainStore.persist.rehydrate();
    expect(useMainStore.getState().selectedPropertyId).toBe("PROPERTY-B");

    useMainStore.getState().setUserProfile(currentUser([propertyA]));
    expect(useMainStore.getState().selectedPropertyId).toBe("PROPERTY-A");
    expect(useMainStore.getState().properties).toEqual([propertyA]);
    expect(useAuthStore.getState().selectedProperty).toBe("PROPERTY-A");
  });

  it("does not carry User A's property into User B's session", () => {
    useMainStore.getState().setSelectedPropertyId("PROPERTY-B");

    const userB = {
      ...currentUser([propertyC]),
      id: 902,
      profile_id: 902,
      user_id: 777,
      username: "property-c-user",
      email: "property-c@example.com",
    };
    useMainStore.getState().setUserProfile(userB);
    useMainStore.getState().setProperties([propertyC]);

    expect(useMainStore.getState().selectedPropertyId).toBe("PROPERTY-C");
    expect(useMainStore.getState().properties).toEqual([propertyC]);
    expect(useAuthStore.getState().selectedProperty).toBe("PROPERTY-C");
    expect(localStorage.getItem("main-store")).not.toContain("PROPERTY-B");
  });

  it("locks the selector only when the authorized backend list has one property", () => {
    useMainStore.setState({
      userProfile: currentUser([propertyA]),
      properties: [propertyA, propertyB],
      selectedPropertyId: "PROPERTY-A",
    });

    render(<HeaderPropertyList />);

    const selector = screen.getByRole("button", {
      name: "Property selector locked to your assigned property",
    });
    expect(selector).toBeDisabled();
    expect(selector).toHaveTextContent("Hotel Alpha");
    expect(screen.queryByRole("button", { name: "Hotel Bravo" })).not.toBeInTheDocument();
  });

  it("displays profile property selections while the separate property list hydrates", () => {
    useMainStore.setState({
      userProfile: currentUser([propertyA, propertyB]),
      properties: [],
      selectedPropertyId: "PROPERTY-B",
      propertyLoading: false,
    });

    render(<HeaderPropertyList />);

    const selector = screen.getByRole("button", { name: "Select property" });
    expect(selector).toHaveTextContent("Hotel Bravo");
    expect(screen.getByRole("button", { name: "Hotel Alpha" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hotel Bravo" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "No Properties" })).not.toBeInTheDocument();
  });

  it("distinguishes loading properties from an account with no assignments", () => {
    useMainStore.setState({
      userProfile: currentUser([]),
      properties: [],
      selectedPropertyId: null,
      propertyLoading: true,
    });

    const view = render(<HeaderPropertyList />);
    expect(screen.getByRole("button", { name: "Loading..." })).toBeDisabled();

    useMainStore.setState({ propertyLoading: false });
    view.rerender(<HeaderPropertyList />);

    const emptyState = screen.getByRole("button", { name: "No Properties" });
    expect(emptyState).toBeDisabled();
    expect(emptyState).toHaveAttribute(
      "title",
      "No properties assigned to your account. Contact your administrator.",
    );
  });

  it("offers only session-hydrated options when profile assignments are absent", () => {
    useMainStore.setState({
      userProfile: null,
      properties: [propertyA, propertyB],
      selectedPropertyId: "PROPERTY-X",
      propertyLoading: false,
    });

    render(<HeaderPropertyList />);

    expect(screen.getByRole("button", { name: "Select property" })).toHaveTextContent("Hotel Alpha");
    expect(screen.getByRole("button", { name: "Hotel Alpha" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hotel Bravo" })).toBeInTheDocument();
    expect(screen.queryByText("PROPERTY-X")).not.toBeInTheDocument();
  });

  it("still applies authorized route changes and redirects unauthorized property routes", async () => {
    const view = render(
      <PropertyAccessGuard>
        <HeaderPropertyList />
      </PropertyAccessGuard>,
    );

    mocks.searchParams = new URLSearchParams("property_id=PROPERTY-B");
    await act(async () => {
      view.rerender(
        <PropertyAccessGuard>
          <HeaderPropertyList />
        </PropertyAccessGuard>,
      );
      await Promise.resolve();
    });
    expect(useMainStore.getState().selectedPropertyId).toBe("PROPERTY-B");

    mocks.searchParams = new URLSearchParams("property_id=PROPERTY-X");
    await act(async () => {
      view.rerender(
        <PropertyAccessGuard>
          <HeaderPropertyList />
        </PropertyAccessGuard>,
      );
      await Promise.resolve();
    });
    expect(mocks.replace).toHaveBeenCalledWith("/dashboard?property_id=PROPERTY-A");
    expect(useMainStore.getState().selectedPropertyId).toBe("PROPERTY-B");
  });
});
