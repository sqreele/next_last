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

    // For now, return null since Auth0 is not fully implemented
    // TODO: Implement proper Auth0 session handling when the integration is ready
    console.log('🔧 Auth0 configured but session handling not implemented yet');
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
