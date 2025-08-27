"use client";

import React, { createContext, useContext, ReactNode, useCallback, useEffect } from 'react';
import { useSession } from '@/app/lib/next-auth-compat';
import { useUser } from '@/app/lib/user-context';
import { usePropertyStore, useAuthStore } from '@/app/lib/stores';

interface Property {
  id: string | number;
  property_id: string;
  name: string;
  description?: string | null;
  created_at?: string;
}

interface PropertyContextType {
  selectedProperty: string | null;
  setSelectedProperty: (propertyId: string) => void;
  hasProperties: boolean;
  userProperties: Property[];
}

const PropertyContext = createContext<PropertyContextType | undefined>(undefined);

export function PropertyProvider({ children }: { children: ReactNode }) {
  const { data: session } = useSession();
  const { userProfile, loading: userLoading, refetch: userRefetch } = useUser();
  
  // Zustand stores
  const { 
    selectedProperty, 
    setSelectedProperty: setStoreProperty,
    userProperties: storeProperties,
    setUserProperties: setStoreProperties
  } = usePropertyStore();

  // Sync user properties to store (only when userProfile changes)
  useEffect(() => {
    if (userProfile?.properties) {
      setStoreProperties(userProfile.properties);
    }
  }, [userProfile?.properties, setStoreProperties]);

  const hasProperties = storeProperties.length > 0;

  // Create the context value using Zustand state
  const contextValue: PropertyContextType = {
    selectedProperty,
    setSelectedProperty: setStoreProperty,
    hasProperties,
    userProperties: storeProperties,
  };

  return (
    <PropertyContext.Provider value={contextValue}>
      {children}
    </PropertyContext.Provider>
  );
}

// Custom hook to use the PropertyContext
export function useProperty() {
  const context = useContext(PropertyContext);
  
  if (context === undefined) {
    throw new Error("useProperty must be used within a PropertyProvider");
  }
  
  return context;
}
