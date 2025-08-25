"use client";
import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useUser } from "@/app/lib/user-context";

interface Property {
  property_id: string; // e.g., "PAA1A6A0E"
  name: string;
  description?: string | null;  // Updated to accept null values
  users?: number[];
  created_at?: string;
  id: string | number;  // Django PK, e.g., 1
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
  const [selectedProperty, setSelectedPropertyState] = useState<string | null>(null);
  const [userProperties, setUserProperties] = useState<Property[]>([]);
  
  const hasProperties = userProperties.length > 0;
  
  // Debug function to log what's happening in the PropertyContext
  const logDebug = useCallback((message: string, data?: any) => {
    console.log(`[PropertyContext] ${message}`, data !== undefined ? data : '');
  }, []);
  
  // Manual refresh function for debugging
  const refreshProperties = useCallback(async () => {
    logDebug('Manual refresh triggered');
    if (userRefetch) {
      try {
        await userRefetch();
        logDebug('User profile refreshed');
      } catch (error) {
        logDebug('Error refreshing user profile:', error);
      }
    }
  }, [userRefetch, logDebug]);
  
  // Get and normalize properties from session or user context
  useEffect(() => {
    // Don't process properties if user context is still loading
    if (userLoading) {
      logDebug('User context still loading, waiting...');
      return;
    }

    logDebug(`Properties useEffect triggered:`, {
      hasSession: !!session,
      hasUser: !!session?.user,
      sessionPropertiesCount: session?.user?.properties?.length || 0,
      hasUserProfile: !!userProfile,
      userProfilePropertiesCount: userProfile?.properties?.length || 0,
      sessionProperties: session?.user?.properties,
      userProfileProperties: userProfile?.properties,
      userProfileLoading: userProfile === undefined ? 'undefined' : userProfile === null ? 'null' : 'loaded',
      userLoading,
      userProfileType: typeof userProfile,
      userProfileKeys: userProfile ? Object.keys(userProfile) : [],
      userProfileFull: userProfile
    });
    
    // Try to get properties from session first
    let properties: any[] = [];
    let source = 'none';
    
    if (session?.user?.properties && session.user.properties.length > 0) {
      properties = session.user.properties;
      source = 'session';
      logDebug(`Using properties from session:`, properties.length);
    } else if (userProfile?.properties && userProfile.properties.length > 0) {
      properties = userProfile.properties;
      source = 'userProfile';
      logDebug(`Using properties from userProfile:`, properties.length);
    } else {
      logDebug('No properties found in session or userProfile', {
        sessionProperties: session?.user?.properties,
        userProfileProperties: userProfile?.properties,
        userProfileType: typeof userProfile,
        userProfileKeys: userProfile ? Object.keys(userProfile) : [],
        userProfileFull: userProfile
      });
      
      // If no properties found and user is not loading, try to refresh
      if (!userLoading && userRefetch) {
        logDebug('No properties found, attempting to refresh user profile...');
        setTimeout(() => {
          refreshProperties();
        }, 1000);
      }
    }
    
    if (properties.length > 0) {
      // Normalize to ensure all properties have property_id consistently 
      const normalizedProperties = properties.map((prop: any) => {
        // Ensure property_id exists and is a string
        const propertyId = prop.property_id ? String(prop.property_id) : 
                           prop.id ? String(prop.id) : 
                           (typeof prop === 'string' || typeof prop === 'number') ? String(prop) : null;
        
        if (!propertyId) {
          logDebug(`Property without ID detected:`, prop);
        }
        
        return {
          ...prop,
          // Always ensure property_id is set
          property_id: propertyId || '1', // Default to '1' if no ID found
          // Ensure name is set
          name: prop.name || `Property ${propertyId || 'Unknown'}`
        };
      });
      
      logDebug(`Normalized ${normalizedProperties.length} properties from ${source}:`, normalizedProperties.map((p: Property) => ({ id: p.property_id, name: p.name })));
      setUserProperties(normalizedProperties);
    } else {
      logDebug('No properties to normalize, setting empty array');
      setUserProperties([]);
    }
  }, [session?.user?.properties, userProfile?.properties, userLoading, logDebug, refreshProperties]);
  
  // Load saved selected property from localStorage on initial render
  useEffect(() => {
    const savedPropertyId = typeof window !== 'undefined' ? localStorage.getItem("selectedPropertyId") : null;
    
    logDebug(`Property selection useEffect triggered:`, {
      savedPropertyId,
      userPropertiesCount: userProperties.length,
      currentSelectedProperty: selectedProperty,
      userPropertyIds: userProperties.map((p: Property) => p.property_id)
    });
    
    if (savedPropertyId) {
      logDebug(`Found saved property ID in localStorage:`, savedPropertyId);
      
      // Only set if it exists in the user's properties
      if (userProperties.some((p: Property) => p.property_id === savedPropertyId)) {
        logDebug(`Setting selected property from localStorage:`, savedPropertyId);
        setSelectedPropertyState(savedPropertyId);
      } else if (userProperties.length > 0) {
        // If saved property doesn't exist in user properties but user has properties, select the first one
        const firstPropertyId = userProperties[0].property_id;
        logDebug(`Saved property not found in user properties. Selecting first property:`, firstPropertyId);
        setSelectedPropertyState(firstPropertyId);
        localStorage.setItem("selectedPropertyId", firstPropertyId);
      }
    } else if (userProperties.length > 0 && !selectedProperty) {
      // If no saved property but user has properties and none selected, select the first one
      const firstPropertyId = userProperties[0].property_id;
      logDebug(`No saved property. Selecting first property:`, firstPropertyId);
      setSelectedPropertyState(firstPropertyId);
      localStorage.setItem("selectedPropertyId", firstPropertyId);
    }
    
    logDebug(`Property selection useEffect completed. Final state:`, {
      selectedProperty: selectedProperty,
      userPropertiesCount: userProperties.length
    });
  }, [userProperties, selectedProperty, logDebug]);
  
  // Improved function to set the selected property
  const setSelectedProperty = useCallback((propertyId: string) => {
    logDebug(`Setting selectedProperty to:`, propertyId);
    
    if (!propertyId || propertyId === "") {
      logDebug(`Empty property ID received, setting to null`);
      setSelectedPropertyState(null);
      localStorage.removeItem("selectedPropertyId");
      return;
    }
    
    // Validate that the property exists in user properties
    const propertyExists = userProperties.some((p: Property) => p.property_id === propertyId);
    
    if (propertyExists) {
      logDebug(`Property exists, setting selected property:`, propertyId);
      setSelectedPropertyState(propertyId);
      localStorage.setItem("selectedPropertyId", propertyId);
    } else {
      logDebug(`Property ID not found in user properties:`, propertyId);
      // If property doesn't exist, don't change selection
    }
  }, [userProperties, logDebug]);
  
  // Create the context value
  const contextValue = {
    selectedProperty,
    setSelectedProperty,
    hasProperties,
    userProperties
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
