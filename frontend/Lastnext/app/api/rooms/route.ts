// app/api/rooms/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/app/lib/session.server';
import { API_CONFIG, DEBUG_CONFIG } from '@/app/lib/config';
import { getErrorMessage } from '@/app/lib/utils/error-utils';

type CacheEntry = {
  expiresAt: number;
  data: unknown;
};

// Small per-user/per-property cache to prevent accidental request storms
// from hammering Auth/session parsing + backend calls.
const ROOMS_CACHE_TTL_MS = 30_000; // 30s
const ROOMS_CACHE_MAX_ENTRIES = 200;
const roomsCache = new Map<string, CacheEntry>();

function makeCacheKey(userId: string | undefined, propertyId: string | null) {
  return `${userId || 'anon'}:${propertyId || 'all'}`;
}

function cacheGet(key: string): unknown | null {
  const entry = roomsCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    roomsCache.delete(key);
    return null;
  }
  return entry.data;
}

function cacheSet(key: string, data: unknown) {
  // Basic eviction: delete the oldest entry when size cap exceeded
  if (roomsCache.size >= ROOMS_CACHE_MAX_ENTRIES) {
    const oldestKey = roomsCache.keys().next().value as string | undefined;
    if (oldestKey) roomsCache.delete(oldestKey);
  }
  roomsCache.set(key, { data, expiresAt: Date.now() + ROOMS_CACHE_TTL_MS });
}

export async function GET(request: NextRequest) {
  try {
    if (DEBUG_CONFIG.logApiCalls) {
      console.log('🔍 Rooms API - Request started');
      console.log('🔍 Request URL:', request.url);
      console.log('🔍 API_CONFIG.baseUrl:', API_CONFIG.baseUrl);
    }

    // ✅ Get session with proper error handling
    const session = await getServerSession();
    
    if (DEBUG_CONFIG.logSessions) {
      console.log('🔍 Rooms API Session Debug:', {
        hasSession: !!session,
        hasUser: !!session?.user,
        hasAccessToken: !!session?.user?.accessToken,
        userId: session?.user?.id,
        username: session?.user?.username,
        accessTokenLength: session?.user?.accessToken?.length,
        sessionError: session?.error,
      });
    }

    if (!session?.user?.accessToken) {
      if (DEBUG_CONFIG.logSessions) {
        console.log('❌ No access token in rooms API session');
      }
      return NextResponse.json({ 
        error: 'Unauthorized',
        debug: DEBUG_CONFIG.logSessions ? {
          hasSession: !!session,
          hasUser: !!session?.user,
          sessionKeys: session ? Object.keys(session) : [],
          userKeys: session?.user ? Object.keys(session.user) : [],
          sessionError: session?.error
        } : undefined
      }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const propertyId = searchParams.get('property');

    // Fast-path: serve cached rooms for this user + property (short TTL)
    const cacheKey = makeCacheKey(session.user.id, propertyId);
    const cached = cacheGet(cacheKey);
    if (cached !== null) {
      const res = NextResponse.json(cached);
      // Allow private caching in the browser/CDN, but never shared.
      res.headers.set('Cache-Control', 'private, max-age=30');
      res.headers.set('X-Rooms-Cache', 'HIT');
      return res;
    }
    
    // ✅ Use the config for API URL construction
    const apiUrl = propertyId
      ? `${API_CONFIG.baseUrl}/api/v1/rooms/?property=${encodeURIComponent(propertyId)}`
      : `${API_CONFIG.baseUrl}/api/v1/rooms/`;
    
    if (DEBUG_CONFIG.logApiCalls) {
      console.log('🔍 Calling Django API:', apiUrl, propertyId ? `(filtered by property ${propertyId})` : '(no property filter)');
      console.log('🔍 With token length:', session.user.accessToken.length);
    }

    // Fetch rooms from the external API
    const response = await fetch(apiUrl, {
      headers: {
        'Authorization': `Bearer ${session.user.accessToken}`,
        'Content-Type': 'application/json',
        'User-Agent': 'NextJS-Server/1.0',
      },
      // Add timeout
      signal: AbortSignal.timeout(15000), // 15 second timeout
    });

    if (DEBUG_CONFIG.logApiCalls) {
      console.log('🔍 Django API response:', response.status, response.statusText);
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Failed to fetch rooms:', response.status, response.statusText, errorText);
      return NextResponse.json(
        { 
          error: 'Failed to fetch rooms', 
          details: errorText, 
          status: response.status,
          apiUrl: DEBUG_CONFIG.logApiCalls ? apiUrl : undefined
        }, 
        { status: response.status }
      );
    }

    const rooms = await response.json();
    
    if (DEBUG_CONFIG.logApiCalls) {
      console.log('✅ Rooms fetched successfully:', Array.isArray(rooms) ? rooms.length : 'Not an array');
    }

    cacheSet(cacheKey, rooms);
    const res = NextResponse.json(rooms);
    res.headers.set('Cache-Control', 'private, max-age=30');
    res.headers.set('X-Rooms-Cache', 'MISS');
    return res;

  } catch (error) {
    console.error('❌ Error in rooms API:', error);
    
    if (error instanceof Error) {
      console.error('Error details:', {
        name: error.name,
        message: error.message,
        stack: DEBUG_CONFIG.logApiCalls ? error.stack : undefined
      });
    }
    
    return NextResponse.json(
      { 
        error: 'Internal server error', 
        details: getErrorMessage(error),
        timestamp: new Date().toISOString()
      }, 
      { status: 500 }
    );
  }
}
