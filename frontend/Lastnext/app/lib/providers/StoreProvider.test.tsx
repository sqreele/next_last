import * as React from "react";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMainStore } from "@/app/lib/stores/mainStore";

const mocks = vi.hoisted(() => ({
  session: null as unknown,
  status: "loading",
}));

vi.mock("@/app/lib/session.client", () => ({
  useSession: () => ({ data: mocks.session, status: mocks.status }),
}));

import { StoreProvider } from "./StoreProvider";

const propertyA = { id: 1, property_id: "PROPERTY-A", name: "Hotel Alpha" };
const propertyB = { id: 2, property_id: "PROPERTY-B", name: "Hotel Bravo" };
const staleProperty = { id: 3, property_id: "PROPERTY-X", name: "Hotel Stale" };

const currentUser = {
  id: 90,
  profile_id: 90,
  user_id: 50,
  username: "property-user",
  email: "property@example.com",
  first_name: "Property",
  last_name: "User",
  display_name: "Property User",
  profile_image: null,
  positions: "Engineer",
  properties: [],
  user_property_name: null,
  user_property_id: null,
  profile_property_name: null,
  profile_property_id: null,
  created_at: "2026-08-12T00:00:00Z",
  email_notifications_enabled: true,
};

beforeEach(() => {
  localStorage.clear();
  mocks.session = null;
  mocks.status = "loading";
  useMainStore.setState({
    userProfile: null,
    properties: [],
    selectedPropertyId: null,
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("StoreProvider property hydration", () => {
  it("uses the session display list when the current-user property list is empty", async () => {
    mocks.status = "authenticated";
    mocks.session = {
      currentUser,
      user: {
        accessToken: "access-token",
        properties: [propertyA],
      },
    };

    render(<StoreProvider><div>child</div></StoreProvider>);

    await waitFor(() => {
      expect(useMainStore.getState().properties).toEqual([propertyA]);
    });
    expect(useMainStore.getState().selectedPropertyId).toBe("PROPERTY-A");
  });

  it("hydrates from the authorized session when the current-user profile is absent", async () => {
    mocks.status = "authenticated";
    mocks.session = {
      currentUser: undefined,
      user: { accessToken: "access-token", properties: [propertyA] },
    };

    render(<StoreProvider><div>child</div></StoreProvider>);

    await waitFor(() => {
      expect(useMainStore.getState().properties).toEqual([propertyA]);
    });
    expect(useMainStore.getState().selectedPropertyId).toBe("PROPERTY-A");
  });

  it("preserves a valid selection and rejects a stale persisted selection", async () => {
    useMainStore.setState({
      properties: [staleProperty],
      selectedPropertyId: "PROPERTY-X",
    });
    mocks.status = "authenticated";
    mocks.session = {
      currentUser,
      user: {
        accessToken: "access-token",
        properties: [propertyA, propertyB],
      },
    };

    const view = render(<StoreProvider><div>child</div></StoreProvider>);
    await waitFor(() => {
      expect(useMainStore.getState().selectedPropertyId).toBe("PROPERTY-A");
    });

    useMainStore.getState().setSelectedPropertyId("PROPERTY-B");
    view.rerender(<StoreProvider><div>child</div></StoreProvider>);
    expect(useMainStore.getState().selectedPropertyId).toBe("PROPERTY-B");
  });

  it("reconciles a changed session list and never retains a cached global property", async () => {
    useMainStore.setState({
      properties: [staleProperty],
      selectedPropertyId: "PROPERTY-X",
    });
    mocks.status = "authenticated";
    mocks.session = {
      currentUser,
      user: { accessToken: "access-token", properties: [propertyA] },
    };

    const view = render(<StoreProvider><div>child</div></StoreProvider>);
    await waitFor(() => expect(useMainStore.getState().properties).toEqual([propertyA]));

    mocks.session = {
      currentUser,
      user: { accessToken: "access-token", properties: [propertyB] },
    };
    view.rerender(<StoreProvider><div>child</div></StoreProvider>);

    await waitFor(() => expect(useMainStore.getState().properties).toEqual([propertyB]));
    expect(useMainStore.getState().selectedPropertyId).toBe("PROPERTY-B");
    expect(useMainStore.getState().properties).not.toContainEqual(staleProperty);
  });

  it("prefers canonical profile assignments over extra session display entries", async () => {
    mocks.status = "authenticated";
    mocks.session = {
      currentUser: { ...currentUser, properties: [propertyA] },
      user: {
        accessToken: "access-token",
        properties: [propertyA, propertyB],
      },
    };

    render(<StoreProvider><div>child</div></StoreProvider>);

    await waitFor(() => {
      expect(useMainStore.getState().properties).toEqual([propertyA]);
    });
    expect(useMainStore.getState().properties).not.toContainEqual(propertyB);
  });

  it("clears properties and stale selection when the authorized session list is empty", async () => {
    useMainStore.setState({
      properties: [staleProperty],
      selectedPropertyId: "PROPERTY-X",
    });
    mocks.status = "authenticated";
    mocks.session = {
      currentUser,
      user: { accessToken: "access-token", properties: [] },
    };

    render(<StoreProvider><div>child</div></StoreProvider>);

    await waitFor(() => expect(useMainStore.getState().properties).toEqual([]));
    expect(useMainStore.getState().selectedPropertyId).toBeNull();
  });
});
