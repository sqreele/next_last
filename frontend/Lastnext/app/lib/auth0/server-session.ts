// Simplified server session that doesn't depend on problematic imports
import type { CompatUser, CompatSession } from './session-compat';

export async function getCompatServerSession(): Promise<CompatSession | null> {
  try {
    // If Auth0 is not fully configured, skip and return null to avoid recursion/errors in prod
    const hasAuth0Config = Boolean(
      process.env.AUTH0_DOMAIN &&
      process.env.AUTH0_CLIENT_ID &&
      (process.env.AUTH0_CLIENT_SECRET || process.env.AUTH0_ISSUER_BASE_URL) &&
      process.env.AUTH0_SECRET
    );

    if (!hasAuth0Config) {
      return null;
    }

    // Try to get session from Auth0 API
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_AUTH0_BASE_URL}/api/auth/[...auth0]?action=profile`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.user) {
          // Convert Auth0 user to CompatUser format
          const compatUser: CompatUser = {
            id: data.user.sub || data.user.user_id || data.user.email || 'user',
            username: data.user.nickname || data.user.name || data.user.email || 'user',
            email: data.user.email,
            profile_image: data.user.picture,
            positions: data.user.positions || 'User',
            properties: data.user.properties || [],
            accessToken: data.user.accessToken || '',
            refreshToken: data.user.refreshToken || '',
            accessTokenExpires: data.user.accessTokenExpires || undefined,
            created_at: data.user.created_at || new Date().toISOString(),
          };

          return { user: compatUser, expires: undefined };
        }
      }
    } catch (auth0Error) {
      console.error('❌ Error fetching Auth0 session:', auth0Error);
    }

    // If Auth0 session fetch fails, return null
    console.log('🔧 Auth0 session not available, returning null');
    return null;
    
  } catch (error) {
    console.error('❌ Error in getCompatServerSession:', error);
    
    // Fallback to mock data in development if Auth0 fails
    if (process.env.NODE_ENV === 'development') {
      console.log('🔧 Development mode: Falling back to mock session due to Auth0 error');
      
      const mockUser: CompatUser = {
        id: 'dev-user-123',
        username: 'developer',
        email: 'dev@example.com',
        profile_image: null,
        positions: 'Developer',
        properties: [
          {
            id: 1,
            property_id: 'prop-001',
            name: 'Development Property',
            address: '123 Dev St, Dev City',
            property_type: 'residential',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
        ],
        accessToken: 'dev-access-token',
        refreshToken: 'dev-refresh-token',
        accessTokenExpires: Date.now() + (24 * 60 * 60 * 1000), // 24 hours from now
        created_at: new Date().toISOString(),
      };

      return { user: mockUser, expires: undefined };
    }
    
    return { user: undefined, error: 'session_error' };
  }
}
