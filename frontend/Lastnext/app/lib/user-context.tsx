'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useSession } from '@/app/lib/next-auth-compat';
import { Property } from '@/app/lib/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';
const CACHE_DURATION = 5 * 60 * 1000;

export interface UserProfile {
  id: number | string;
  username: string;
  profile_image: string | null;
  positions: string;
  properties: Property[];
  email?: string | null;
  created_at: string;
}

export interface UserContextType {
  userProfile: UserProfile | null;
  selectedProperty: string;
  setSelectedProperty: (propertyId: string) => void;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<UserProfile | null>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedProperty, setSelectedProperty] = useState('');
  const [lastFetched, setLastFetched] = useState(0);

  // Helper function to safely extract property ID
  const getPropertyId = useCallback((property: any): string => {
    if (!property) return "";
    if (typeof property === "string" || typeof property === "number") return String(property);
    if (typeof property.property_id === "string" || typeof property.property_id === "number") {
      return String(property.property_id);
    }
    if (typeof property.id === "string" || typeof property.id === "number") {
      return String(property.id);
    }
    return "";
  }, []);

  const fetchUserProfile = useCallback(async () => {
    if (!session?.user?.accessToken) return null;
    if (Date.now() - lastFetched < CACHE_DURATION && userProfile) {
      return userProfile;
    }

    try {
      console.log('Fetching user profile and properties...');
      
      // Check if we're in development mode with mock tokens
      const isDevelopment = process.env.NODE_ENV === 'development';
      const isMockToken = session.user.accessToken === 'dev-access-token';
      
      if (isDevelopment && isMockToken) {
        console.log('🔧 Development mode: Using mock user data instead of API calls');
        
        // Use the session data directly instead of making API calls
        const mockProfile: UserProfile = {
          id: session.user.id,
          username: session.user.username,
          profile_image: session.user.profile_image,
          positions: session.user.positions,
          email: session.user.email,
          created_at: session.user.created_at,
          properties: session.user.properties || []
        };
        
        setUserProfile(mockProfile);
        setLastFetched(Date.now());
        setError(null);
        return mockProfile;
      }
      
      // Fetch user profile from API (production mode)
      const profileResponse = await fetch(`${API_URL}/api/v1/user-profiles/`, {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.user.accessToken}`,
        },
      });

      if (!profileResponse.ok) {
        throw new Error(`Failed to fetch profile: ${profileResponse.status}`);
      }

      const profileDataArray = await profileResponse.json();
      console.log('Profile data array:', profileDataArray);
      
      // Get the first profile or handle empty array
      const profileData = Array.isArray(profileDataArray) && profileDataArray.length > 0 
        ? profileDataArray[0] 
        : profileDataArray;
        
      if (!profileData) {
        throw new Error('No profile data found');
      }
      
      console.log('Selected profile data:', profileData);

      // Fetch properties
      const propertiesResponse = await fetch(`${API_URL}/api/v1/properties/`, {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.user.accessToken}`,
        },
      });

      if (!propertiesResponse.ok) {
        throw new Error(`Failed to fetch properties: ${propertiesResponse.status}`);
      }

      const propertiesData = await propertiesResponse.json();
      console.log('Fetched properties:', propertiesData);
      
      // Ensure each property has a valid property_id
      const normalizedProperties = propertiesData.map((property: any) => {
        return {
          ...property,
          property_id: property.property_id || String(property.id)
        };
      });

      console.log('Normalized properties:', normalizedProperties);

      // Create user profile with properties
      const profile: UserProfile = {
        id: profileData.id,
        username: profileData.username,
        profile_image: profileData.profile_image,
        positions: profileData.positions,
        email: profileData.email,
        created_at: profileData.created_at,
        properties: normalizedProperties
      };
      
      console.log('Final user profile:', profile);

      setUserProfile(profile);
      setLastFetched(Date.now());
      setError(null);

      // Don't automatically set selected property to prevent infinite loops
      // Let the PropertyContext handle property selection

      return profile;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch profile';
      console.error('Error fetching user data:', message);
      setError(message);
      setUserProfile(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, [session?.user?.accessToken, session?.user?.id, session?.user?.username, session?.user?.profile_image, session?.user?.positions, session?.user?.email, session?.user?.created_at, session?.user?.properties]); // Updated dependencies

  useEffect(() => {
    let mounted = true;

    const initializeData = async () => {
      if (status !== 'authenticated' || !mounted) return;
      
      setLoading(true);
      await fetchUserProfile();
      if (mounted) setLoading(false);
    };

    initializeData();

    return () => {
      mounted = false;
    };
  }, [status]); // Only depend on status, not fetchUserProfile

  return (
    <UserContext.Provider
      value={{
        userProfile,
        selectedProperty,
        setSelectedProperty,
        loading,
        error,
        refetch: fetchUserProfile,
      }}
    >
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
}