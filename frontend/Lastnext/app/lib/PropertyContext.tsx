"use client";

import React, { createContext, useContext, ReactNode, useEffect } from 'react';
import { useUser } from '@/app/lib/user-context';
import { usePropertyStore } from '@/app/lib/stores';
import type { Property } from '@/app/lib/types';
import { getDefaultPropertyId } from '@/app/lib/security/propertyAccess';

interface PropertyContextType {
  selectedProperty: string | null;
  setSelectedProperty: (propertyId: string) => void;
  hasProperties: boolean;
  userProperties: Property[];
}

const PropertyContext = createContext<PropertyContextType | undefined>(undefined);

export function PropertyProvider({ children }: { children: ReactNode }) {
  const { userProfile } = useUser();
  
  // Zustand stores
  const { 
    selectedProperty, 
    setSelectedProperty: setStoreProperty,
    userProperties: storeProperties,
    setUserProperties: setStoreProperties,
    hydrateFromStorage
  } = usePropertyStore();

  // Hydrate from localStorage when component mounts
  useEffect(() => {
    hydrateFromStorage();
  }, [hydrateFromStorage]);

  // Sync user properties to store (only when userProfile changes)
  useEffect(() => {
    if (userProfile?.properties) {
      setStoreProperties(userProfile.properties);
      
      // Auto-select only a sole accessible property.
      if (!selectedProperty) {
        const propertyId = getDefaultPropertyId(userProfile.properties);
        if (propertyId) setStoreProperty(propertyId);
      }
    }
  }, [userProfile?.properties, setStoreProperties, selectedProperty, setStoreProperty]);

  // Additional effect to ensure a property is selected when properties are available
  useEffect(() => {
    if (storeProperties.length > 0 && !selectedProperty) {
      const propertyId = getDefaultPropertyId(storeProperties);
      if (propertyId) setStoreProperty(propertyId);
    }
  }, [storeProperties, selectedProperty, setStoreProperty]);

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
