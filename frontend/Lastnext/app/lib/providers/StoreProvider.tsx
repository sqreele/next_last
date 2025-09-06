'use client';

import { ReactNode, useEffect } from 'react';
import { useMainStore } from '../stores/mainStore';
import { useSession } from '../session.client';

interface StoreProviderProps {
  children: ReactNode;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession();
  const setUserProfile = useMainStore(state => state.setUserProfile);
  const setProperties = useMainStore(state => state.setProperties);
  const setSelectedPropertyId = useMainStore(state => state.setSelectedPropertyId);
  const setAuthTokens = useMainStore(state => state.setAuthTokens);

  // Sync session data to Zustand store
  useEffect(() => {
    if (status === 'authenticated' && session?.user) {
      console.log('🔄 Syncing session data to Zustand store...');
      
      // Set auth tokens
      if (session.user.accessToken) {
        setAuthTokens(session.user.accessToken, session.user.refreshToken || '');
      }

      // Create user profile from session data
      if (session.user) {
        const userProfile = {
          id: session.user.id,
          username: session.user.username || '',
          profile_image: session.user.profile_image || null,
          positions: session.user.positions || 'User',
          properties: session.user.properties || [],
          email: session.user.email || null,
          first_name: session.user.first_name || null,
          last_name: session.user.last_name || null,
          created_at: session.user.created_at || new Date().toISOString(),
        };

        // Only update user profile if it has changed
        const currentProfile = useMainStore.getState().userProfile;
        const profileChanged = !currentProfile || 
          currentProfile.id !== userProfile.id ||
          currentProfile.username !== userProfile.username ||
          currentProfile.email !== userProfile.email;
        
        if (profileChanged) {
          console.log('✅ Setting user profile in store:', userProfile);
          setUserProfile(userProfile);
        }

        // Set properties in store (only if they've changed)
        if (session.user.properties && session.user.properties.length > 0) {
          const currentProperties = useMainStore.getState().properties;
          const propertiesChanged = !currentProperties || 
            currentProperties.length !== session.user.properties.length ||
            !currentProperties.every((prop, index) => 
              prop.property_id === session.user.properties[index]?.property_id ||
              prop.id === session.user.properties[index]?.id
            );
          
          if (propertiesChanged) {
            console.log('✅ Setting properties in store:', session.user.properties.length);
            setProperties(session.user.properties);
          }

          // Auto-select first property if none selected
          const currentSelectedProperty = useMainStore.getState().selectedPropertyId;
          if (!currentSelectedProperty) {
            const firstProperty = session.user.properties[0];
            const propertyId = String(firstProperty.property_id || firstProperty.id);
            console.log('✅ Auto-selecting first property:', propertyId);
            setSelectedPropertyId(propertyId);
          }
        }
      }
    } else if (status === 'unauthenticated') {
      // Clear store data when unauthenticated
      console.log('🔄 Clearing store data (unauthenticated)');
      setUserProfile(null);
      setProperties([]);
      setSelectedPropertyId(null);
      setAuthTokens('', '');
    }
  }, [session, status, setUserProfile, setProperties, setSelectedPropertyId, setAuthTokens]);

  return <>{children}</>;
}

// Optional: Add a hook for components that need access to the entire store
export const useStore = useMainStore;
