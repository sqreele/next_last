'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useSession } from '@/app/lib/session.client';
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
  first_name?: string | null;
  last_name?: string | null;
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
      console.log('Creating user profile from session data...');
      
      // Use session data directly instead of making API calls
      // This avoids authorization issues with separate endpoints
      
      // Create user profile from session data
      const profile: UserProfile = {
        id: session.user.id,
        username: session.user.username,
        profile_image: session.user.profile_image,
        positions: session.user.positions || 'User',
        email: session.user.email,
        first_name: session.user.first_name,
        last_name: session.user.last_name,
        created_at: session.user.created_at,
        properties: session.user.properties || []
      };
      
      console.log('User profile from session:', profile);

      setUserProfile(profile);
      setLastFetched(Date.now());
      setError(null);

      // Auto-select first property if none selected and user has properties
      if (!selectedProperty && profile.properties.length > 0) {
        const firstProperty = profile.properties[0];
        const propertyId = getPropertyId(firstProperty);
        if (propertyId) {
          setSelectedProperty(propertyId);
          console.log('🔧 Auto-selected property in UserProvider:', propertyId);
        }
      }

      return profile;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create profile from session';
      console.error('Error creating user profile from session:', message);
      setError(message);
      setUserProfile(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, [session?.user, lastFetched, userProfile, selectedProperty, setSelectedProperty, getPropertyId]);

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