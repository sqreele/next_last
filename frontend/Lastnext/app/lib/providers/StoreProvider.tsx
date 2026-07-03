'use client';

import { ReactNode, useEffect } from 'react';
import { useMainStore } from '../stores/mainStore';
import { getPropertyId } from '../security/propertyAccess';
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
      
      // Set auth tokens
      if (session.user?.accessToken) {
        setAuthTokens(session.user.accessToken, '');
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

        const sessionProperties = Array.isArray(session.user.properties) ? session.user.properties : [];
        const currentProfile = useMainStore.getState().userProfile;
        const currentProfileProperties = Array.isArray(currentProfile?.properties) ? currentProfile.properties : [];
        const profilePropertiesChanged =
          currentProfileProperties.length !== sessionProperties.length ||
          !currentProfileProperties.every((prop, index) => getPropertyId(prop) === getPropertyId(sessionProperties[index]));
        const profileChanged = !currentProfile || 
          currentProfile.id !== userProfile.id ||
          currentProfile.username !== userProfile.username ||
          currentProfile.email !== userProfile.email ||
          profilePropertiesChanged;
        
        if (profileChanged) {
          setUserProfile(userProfile);
        }

        // Keep the global property list exactly in sync with the current API/session payload,
        // including empty arrays so stale properties from a previous user cannot remain selectable.
        const currentProperties = useMainStore.getState().properties;
        const propertiesChanged =
          currentProperties.length !== sessionProperties.length ||
          !currentProperties.every((prop, index) => getPropertyId(prop) === getPropertyId(sessionProperties[index]));
        
        if (propertiesChanged) {
          setProperties(sessionProperties);
        }

        // Auto-select first authorized property if none selected.
        const currentSelectedProperty = useMainStore.getState().selectedPropertyId;
        if (!currentSelectedProperty) {
          const firstProperty = sessionProperties[0];
          if (firstProperty) {
            const propertyId = getPropertyId(firstProperty);
            setSelectedPropertyId(propertyId);
          }
        }
      }
    } else if (status === 'unauthenticated') {
      // Clear store data when unauthenticated
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
