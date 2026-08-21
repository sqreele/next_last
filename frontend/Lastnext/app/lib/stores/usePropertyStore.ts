"use client";

import { create } from "zustand";

// Import the consolidated Property interface from types
import { Property } from '../types';
import { getDefaultPropertyId, getPropertyId } from '../security/propertyAccess';

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
    // ✅ SECURITY: Validate property access before setting
    const props = get().userProperties;
    
    // Allow null selection (deselect)
    if (propertyId === null) {
      if (typeof window !== "undefined") {
        localStorage.removeItem("selectedPropertyId");
      }
      set({ selectedProperty: null });
      return;
    }
    
    // Verify user has access to this property
    const hasAccess = props.some((p) => getPropertyId(p) === propertyId);
    if (!hasAccess) {
      console.warn(`⚠️ Security: Attempted to select unauthorized property: ${propertyId}`);
      console.warn(`⚠️ User only has access to: ${props.map(getPropertyId).join(', ')}`);
      // Don't set the unauthorized property
      return;
    }
    
    // Persist selection only if validated
    if (typeof window !== "undefined") {
      localStorage.setItem("selectedPropertyId", propertyId);
    }
    set({ selectedProperty: propertyId });
  },
  setUserProperties: (properties: Property[]) => {
    const selectedProperty = get().selectedProperty;
    const selectedIsAllowed = properties.some(
      (property) => getPropertyId(property) === selectedProperty,
    );
    set({
      userProperties: properties,
      selectedProperty: selectedIsAllowed
        ? selectedProperty
        : getDefaultPropertyId(properties),
    });
  },
  hydrateFromStorage: () => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem("selectedPropertyId");
    // Only set if matches current user properties; otherwise leave null
    const props = get().userProperties;
    if (saved && props.some((p) => getPropertyId(p) === saved)) {
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

