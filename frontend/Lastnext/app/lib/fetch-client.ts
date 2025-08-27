// lib/fetch-client.ts
import { cache } from 'react';
import { cookies } from 'next/headers';
import { API_CONFIG } from '@/app/lib/config';

// Server-side helper to read session-compat endpoint
const getCompatClientSession = cache(async () => {
  try {
    const cookieStoreOrPromise = cookies() as any;
    const cookieStore = typeof cookieStoreOrPromise?.get === 'function' ? cookieStoreOrPromise : await cookieStoreOrPromise;
    // Use internal call to our session-compat API route
    const res = await fetch(`${API_CONFIG.baseUrl}/api/auth/session-compat`, {
      headers: {
        Cookie: cookieStore?.toString?.() || ''
      },
      cache: 'no-store'
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
});

export async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const session = await getCompatClientSession();
  
  if (!session?.user?.accessToken) {
    throw new Error('No access token');
  }

  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${session.user.accessToken}`);

  try {
    const response = await fetch(url, {
      ...options,
      headers,
      credentials: 'include',
    });

    if (!response.ok) {
      const contentType = response.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        const errorData = await response.json();
        if (errorData.detail) {
          throw new Error(errorData.detail);
        }
        // If no detail field, throw the raw error
        throw new Error(JSON.stringify(errorData));
      }
      throw new Error(`Request failed with status ${response.status}`);
    }

    return response;
  } catch (error) {
    console.error('Fetch error:', error);
    throw error;
  }
}