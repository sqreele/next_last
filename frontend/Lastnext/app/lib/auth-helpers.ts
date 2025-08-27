// app/lib/auth-helpers.ts (update the refresh function)
import { API_CONFIG, DEBUG_CONFIG } from '@/app/lib/config';
import { jwtDecode } from 'jwt-decode';

export async function refreshAccessToken(refreshToken: string) {
  if (DEBUG_CONFIG.logAuth) {
    console.log("🔐 Starting token refresh...");
  }
  
  try {
    const url = `${API_CONFIG.baseUrl}/api/v1/token/refresh/`;
    
    if (DEBUG_CONFIG.logAuth) {
      console.log("🔐 Refresh URL:", url);
    }
    
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh: refreshToken }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("🔐 Token refresh failed:", response.status, errorText);
      return { error: "Failed to refresh token" };
    }

    const tokens = await response.json();
    
    if (DEBUG_CONFIG.logAuth) {
      console.log("🔐 Token refresh successful");
    }
    
    // Derive expiry from token exp claim to match backend lifetime
    let accessTokenExpires = Date.now() + 30 * 60 * 1000; // fallback 30m
    try {
      const decoded: { exp?: number } = jwtDecode(tokens.access);
      if (decoded?.exp) {
        accessTokenExpires = decoded.exp * 1000;
      }
    } catch (e) {
      console.warn('🔐 Failed to decode refreshed access token exp, using fallback');
    }

    return {
      accessToken: tokens.access,
      refreshToken: tokens.refresh || refreshToken,
      accessTokenExpires,
    };
  } catch (error) {
    console.error("🔐 Token refresh error:", error);
    return { error: "Network error during token refresh" };
  }
}
