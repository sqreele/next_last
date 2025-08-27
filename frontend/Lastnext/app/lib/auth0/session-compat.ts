import { getSession as getAuth0Session, getAccessToken } from '@auth0/nextjs-auth0';
import { cookies } from 'next/headers';
import { API_CONFIG } from '@/app/lib/config';

export interface CompatUser {
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
}

export interface CompatSession {
  user?: CompatUser;
  error?: string;
  expires?: string;
}

async function fetchBackendProfile(accessToken: string) {
  try {
    const res = await fetch(`${API_CONFIG.baseUrl}${API_CONFIG.endpoints.userProfile}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data) ? (data[0] ?? null) : data;
  } catch {
    return null;
  }
}

export async function getCompatServerSession(): Promise<CompatSession | null> {
  const session = await getAuth0Session();
  if (!session?.user) return null;

  // Try to obtain a valid API access token from the Auth0 session
  let auth0AccessToken = (session as any).accessToken as string | undefined;
  if (!auth0AccessToken) {
    try {
      const tokenResult = await getAccessToken();
      auth0AccessToken = tokenResult?.accessToken;
    } catch {
      // ignore and fallback to cookie approach below
    }
  }

  let accessToken = auth0AccessToken;
  let refreshToken = '';
  let accessTokenExpires: number | undefined = undefined;

  if (!accessToken) {
    const cookieStoreOrPromise = cookies() as any;
    const cookieStore = typeof cookieStoreOrPromise?.get === 'function'
      ? cookieStoreOrPromise
      : await cookieStoreOrPromise;
    accessToken = cookieStore?.get?.('accessToken')?.value;
    refreshToken = cookieStore?.get?.('refreshToken')?.value || '';
  }

  if (!accessToken) return { user: undefined, error: 'missing_token' };

  const profile = await fetchBackendProfile(accessToken);

  const user: CompatUser = {
    id: (profile?.id ?? session.user.sub ?? session.user.email ?? 'user') + '',
    username: profile?.username ?? (session.user.nickname || session.user.name || session.user.email || 'user'),
    email: (profile?.email ?? session.user.email ?? null) as string | null,
    profile_image: (profile?.profile_image ?? (session.user.picture as string | null) ?? null) as string | null,
    positions: profile?.positions ?? 'User',
    properties: Array.isArray(profile?.properties) ? profile!.properties : [],
    accessToken,
    refreshToken,
    accessTokenExpires,
    created_at: profile?.created_at ?? new Date().toISOString(),
  };

  return { user, expires: undefined };
}

