"use client";

import { create } from "zustand";

export interface Property {
  id: string | number;
  property_id: string;
  name: string;
  description?: string | null;
  created_at?: string;
}

interface PropertyState {
  selectedProperty: string | null;
  userProperties: Property[];
  hasProperties: boolean;
  setSelectedProperty: (propertyId: string | null) => void;
  setUserProperties: (properties: Property[]) => void;
  hydrateFromStorage: () => void;
  clear: () => void;
}

export const usePropertyStore = create<PropertyState>((set, get) => ({
  selectedProperty: null,
  userProperties: [],
  get hasProperties() {
    return get().userProperties.length > 0;
  },
  setSelectedProperty: (propertyId: string | null) => {
    // Persist selection
    if (typeof window !== "undefined") {
      if (propertyId) {
        localStorage.setItem("selectedPropertyId", propertyId);
      } else {
        localStorage.removeItem("selectedPropertyId");
      }
    }
    set({ selectedProperty: propertyId });
  },
  setUserProperties: (properties: Property[]) => {
    set({ userProperties: properties });
    // Don't automatically change selectedProperty here to prevent infinite loops
  },
  hydrateFromStorage: () => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem("selectedPropertyId");
    // Only set if matches current user properties; otherwise leave null
    const props = get().userProperties;
    if (saved && props.some((p) => p.property_id === saved)) {
      set({ selectedProperty: saved });
    }
    // Remove automatic property selection to prevent infinite loops
  },
  clear: () => {
    set({ selectedProperty: null, userProperties: [] });
    if (typeof window !== "undefined") {
      localStorage.removeItem("selectedPropertyId");
    }
  },
}));


