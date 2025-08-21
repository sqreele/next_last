// app/lib/csrf.ts - CSRF token utilities

let csrfToken: string | null = null;

/**
 * Fetch CSRF token from Django backend
 */
export async function fetchCsrfToken(): Promise<string | null> {
  try {
    // Temporarily disable CSRF token fetching to resolve the error
    // TODO: Re-enable when CSRF is properly configured
    console.log('CSRF token fetching temporarily disabled');
    return null;
    
    // Use the internal API URL for server-side requests
    // const baseUrl = process.env.NEXT_PRIVATE_API_URL || 'http://backend:8000';
    // const response = await fetch(`${baseUrl}/api/v1/csrf-token/`, {
    //   method: 'GET',
    //   credentials: 'include',
    // });

    // if (response.ok) {
    //   const data = await response.json();
    //   csrfToken = data.csrfToken;
    //   return csrfToken;
    // }
  } catch (error) {
    console.error('Failed to fetch CSRF token:', error);
  }
  
  return null;
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
  // Temporarily disable CSRF token fetching to resolve the error
  // TODO: Re-enable when CSRF is properly configured
  console.log('CSRF headers temporarily disabled');
  return {};
  
  // const token = await getCsrfToken();
  // if (token) {
  //   return {
  //     'X-CSRFToken': token,
  //   };
  // }
  // return {};
}

/**
 * Clear stored CSRF token (useful for logout)
 */
export function clearCsrfToken(): void {
  csrfToken = null;
}
