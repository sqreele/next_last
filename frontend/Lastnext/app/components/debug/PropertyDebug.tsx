'use client';

import { useMainStore } from '@/app/lib/stores/mainStore';
import { useSession } from '@/app/lib/session.client';

export function PropertyDebug() {
  // Use more specific selectors to prevent unnecessary re-renders
  const selectedProperty = useMainStore(state => state.selectedPropertyId);
  const userProfile = useMainStore(state => state.userProfile);
  const userProperties = useMainStore(state => state.properties);
  const { data: session } = useSession();
  
  // Calculate hasProperties from the properties array
  const hasProperties = userProperties && userProperties.length > 0;

  if (process.env.NODE_ENV !== 'development') {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 bg-black/90 text-white p-4 rounded-lg text-xs max-w-md z-50">
      <h3 className="font-bold mb-2">🔍 Property Debug</h3>
      
      <div className="space-y-2">
        <div>
          <strong>Session Properties:</strong>
          <div className="ml-2">
            Count: {session?.user?.properties?.length || 0}
            <br />
            Data: {JSON.stringify(session?.user?.properties?.map(p => ({ id: p.property_id, name: p.name })) || [], null, 2)}
          </div>
        </div>
        
        <div>
          <strong>User Context Properties:</strong>
          <div className="ml-2">
            Count: {userProfile?.properties?.length || 0}
            <br />
            Data: {JSON.stringify(userProfile?.properties?.map(p => ({ id: p.property_id, name: p.name })) || [], null, 2)}
          </div>
        </div>
        
        <div>
          <strong>Property Context:</strong>
          <div className="ml-2">
            Has Properties: {hasProperties ? 'Yes' : 'No'}
            <br />
            User Properties Count: {userProperties.length}
            <br />
            Selected Property: {selectedProperty || 'None'}
            <br />
            User Properties: {JSON.stringify(userProperties.map(p => ({ id: p.property_id, name: p.name })), null, 2)}
          </div>
        </div>
        
        <div>
          <strong>Session User:</strong>
          <div className="ml-2">
            ID: {session?.user?.id}
            <br />
            Username: {session?.user?.username}
            <br />
            Has Access Token: {!!session?.user?.accessToken ? 'Yes' : 'No'}
          </div>
        </div>
      </div>
    </div>
  );
}
