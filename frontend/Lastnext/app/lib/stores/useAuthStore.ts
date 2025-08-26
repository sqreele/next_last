"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface UserProfile {
  id: string | number;
  username: string;
  profile_image?: string | null;
  positions: string;
  properties: Array<{
    id: string | number;
    property_id: string;
    name: string;
    description?: string | null;
    created_at?: string;
  }>;
  email?: string | null;
  created_at: string;
}

interface AuthState {
  userProfile: UserProfile | null;
  selectedProperty: string | null;
  loading: boolean;
  error: string | null;
  lastFetched: number | null;
  
  // Actions
  setUserProfile: (profile: UserProfile | null) => void;
  setSelectedProperty: (propertyId: string | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setLastFetched: (timestamp: number) => void;
  clearAuth: () => void;
  updatePropertySelection: (propertyId: string) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      userProfile: null,
      selectedProperty: null,
      loading: false,
      error: null,
      lastFetched: null,

      setUserProfile: (profile) => {
        set({ userProfile: profile });
        
        // Auto-select property if none selected
        if (profile && profile.properties.length > 0 && !get().selectedProperty) {
          const firstProperty = profile.properties[0];
          set({ selectedProperty: firstProperty.property_id });
        }
      },

      setSelectedProperty: (propertyId) => {
        set({ selectedProperty: propertyId });
      },

      setLoading: (loading) => set({ loading }),

      setError: (error) => set({ error }),

      setLastFetched: (timestamp) => set({ lastFetched: timestamp }),

      clearAuth: () => {
        set({
          userProfile: null,
          selectedProperty: null,
          error: null,
          lastFetched: null,
        });
      },

      updatePropertySelection: (propertyId) => {
        const { userProfile } = get();
        if (userProfile?.properties.some(p => p.property_id === propertyId)) {
          set({ selectedProperty: propertyId });
        }
      },
    }),
    {
      name: "auth-storage",
      partialize: (state) => ({
        selectedProperty: state.selectedProperty,
        lastFetched: state.lastFetched,
      }),
    }
  )
);
