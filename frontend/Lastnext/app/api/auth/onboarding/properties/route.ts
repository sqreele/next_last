import { NextRequest, NextResponse } from 'next/server';
import { API_CONFIG } from '@/app/lib/config';

/**
 * GET /api/auth/onboarding/properties
 * 
 * Fetches ALL properties for the onboarding flow.
 * This allows new users to see and select from all available properties.
 */
export async function GET(request: NextRequest) {
  try {
    // Get authorization header
    const authHeader = request.headers.get('authorization');
    
    if (!authHeader) {
      return NextResponse.json(
        { error: 'Authorization required' },
        { status: 401 }
      );
    }

    // Fetch ALL properties using the dedicated 'all' endpoint
    // This ensures new users can see all available properties, not just their assigned ones
    let response = await fetch(`${API_CONFIG.baseUrl}/api/v1/properties/all/`, {
      method: 'GET',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
    });

    // Fallback to regular properties endpoint if 'all' doesn't exist
    if (!response.ok && response.status === 404) {
      console.log('🔍 Falling back to regular properties endpoint');
      response = await fetch(`${API_CONFIG.baseUrl}/api/v1/properties/`, {
        method: 'GET',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
      });
    }

    if (!response.ok) {
      console.error('Failed to fetch properties for onboarding:', response.status);
      
      // If unauthorized, still try to return empty list
      if (response.status === 401 || response.status === 403) {
        return NextResponse.json({ properties: [] });
      }
      
      return NextResponse.json(
        { error: 'Failed to fetch properties', properties: [] },
        { status: response.status }
      );
    }

    const properties = await response.json();
    
    console.log('🔍 Onboarding properties fetched:', {
      count: Array.isArray(properties) ? properties.length : 0
    });

    return NextResponse.json({
      properties: Array.isArray(properties) ? properties : [],
    });

  } catch (error) {
    console.error('Error in onboarding properties route:', error);
    return NextResponse.json(
      { error: 'Internal server error', properties: [] },
      { status: 500 }
    );
  }
}

