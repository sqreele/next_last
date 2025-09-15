// app/lib/csrf.ts - CSRF token utilities
declare const process: any;

let csrfToken: string | null = null;

// Determine the correct backend base URL for both client and server
function getBackendBaseUrl(): string {
  if (typeof window === 'undefined') {
    return process.env.NEXT_PRIVATE_API_URL || 'http://backend:8000';
  }
  return (
    process.env.NEXT_PUBLIC_API_URL ||
    (process.env.NODE_ENV === 'development' ? 'http://localhost:8000' : 'https://pcms.live')
  );
}

/**
 * Fetch CSRF token from Django backend
 */
export async function fetchCsrfToken(): Promise<string | null> {
  try {
    const baseUrl = getBackendBaseUrl();
    const response = await fetch(`${baseUrl}/api/v1/csrf-token/`, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      console.warn('Failed to fetch CSRF token. Status:', response.status);
      return null;
    }

    const data = await response.json();
    if (data && typeof data.csrfToken === 'string') {
      csrfToken = data.csrfToken;
      return csrfToken;
    }
    return null;
  } catch (error) {
    console.error('Failed to fetch CSRF token:', error);
    return null;
  }
}

/**
 * Get current CSRF token (fetch if not available)
 */
export async function getCsrfToken(): Promise<string | null> {
  if (!csrfToken) {
    return await fetchCsrfToken();
  }
  return csrfToken;
}

/**
 * Get CSRF headers for API requests
 */
export async function getCsrfHeaders(): Promise<Record<string, string>> {
  const token = await getCsrfToken();
  if (token) {
    return { 'X-CSRFToken': token };
  }
  return {};
}

/**
 * Clear stored CSRF token (useful for logout)
 */
export function clearCsrfToken(): void {
  csrfToken = null;
}
