import { Auth0Client } from '@auth0/nextjs-auth0/server';

type CompatUser = {
  id: string;
  username: string;
  email: string | null;
  profile_image: string | null;
  positions: string;
  properties: any[];
  accessToken: string;
  refreshToken: string;
  accessTokenExpires?: number;
  created_at: string;
};

type CompatSession = {
  user?: CompatUser;
  error?: string;
  expires?: string;
} | null;

const auth0 = new Auth0Client();

export async function getServerSession(): Promise<CompatSession> {
  try {
    const session = await auth0.getSession();

    if (!session) {
      if (process.env.NODE_ENV === 'development') {
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
          accessTokenExpires: Date.now() + (24 * 60 * 60 * 1000),
          created_at: new Date().toISOString(),
        };
        return { user: mockUser, expires: undefined };
      }
      return null;
    }

    // Try to obtain an API access token from Auth0 (optional)
    let accessToken = '';
    try {
      const tokenResult = await auth0.getAccessToken();
      if (tokenResult?.token) {
        accessToken = tokenResult.token;
      }
    } catch (err) {
      // Access token may not be configured; proceed without it
    }

    const compatUser: CompatUser = {
      id: (session.user as any)?.sub || session.user.email || 'user',
      username: (session.user as any)?.nickname || session.user.name || session.user.email || 'user',
      email: session.user.email ?? null,
      profile_image: (session.user as any)?.picture ?? null,
      positions: 'User',
      properties: [],
      accessToken,
      refreshToken: '',
      created_at: new Date().toISOString(),
    };

    return { user: compatUser };
  } catch (error) {
    console.error('Error in getServerSession:', error);
    return { user: undefined, error: 'session_error' };
  }
}

