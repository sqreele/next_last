import { NextRequest, NextResponse } from 'next/server';
import { API_CONFIG } from '@/app/lib/config';

/**
 * POST /api/auth/onboarding/complete
 * 
 * Completes the onboarding process by:
 * 1. Assigning the selected properties to the user via the backend
 * 2. Returning success status
 */
export async function POST(request: NextRequest) {
  try {
    // Get authorization header
    const authHeader = request.headers.get('authorization');
    
    if (!authHeader) {
      return NextResponse.json(
        { error: 'Authorization required' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { property_ids, email, username, auth0_sub } = body;

    console.log('🔍 Onboarding complete request:', {
      email,
      username,
      auth0_sub,
      property_ids,
      property_count: property_ids?.length
    });

    if (!property_ids || !Array.isArray(property_ids) || property_ids.length === 0) {
      return NextResponse.json(
        { error: 'At least one property must be selected' },
        { status: 400 }
      );
    }

    // Use the dedicated assign_properties endpoint
    const assignResponse = await fetch(`${API_CONFIG.baseUrl}/api/v1/properties/assign_properties/`, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ property_ids }),
    });

    if (!assignResponse.ok) {
      const errorText = await assignResponse.text();
      console.error('Failed to assign properties:', assignResponse.status, errorText);
      
      // Fallback: Try to assign properties one by one using add_user endpoint
      console.log('🔍 Trying fallback: assign properties one by one');
      
      // First, get all properties to map IDs to property_ids
      const allPropsResponse = await fetch(`${API_CONFIG.baseUrl}/api/v1/properties/all/`, {
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
      });

      let allProps: any[] = [];
      if (allPropsResponse.ok) {
        allProps = await allPropsResponse.json();
      }

      let successCount = 0;
      const assignedProperties: any[] = [];
      
      for (const propId of property_ids) {
        try {
          // Find the property by ID
          const prop = allProps.find((p: any) => p.id === propId);
          if (!prop) continue;

          const addUserResponse = await fetch(
            `${API_CONFIG.baseUrl}/api/v1/properties/${prop.property_id}/add_user/`,
            {
              method: 'POST',
              headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({}),
            }
          );

          if (addUserResponse.ok) {
            successCount++;
            assignedProperties.push({
              id: prop.id,
              property_id: prop.property_id,
              name: prop.name
            });
          }
        } catch (err) {
          console.error(`Error assigning property ${propId}:`, err);
        }
      }

      if (successCount === 0) {
        return NextResponse.json(
          { error: 'Failed to assign properties. Please contact administrator.' },
          { status: 500 }
        );
      }

      console.log('✅ Onboarding complete (fallback method):', {
        assignedCount: successCount,
        totalRequested: property_ids.length
      });

      return NextResponse.json({
        success: true,
        message: `Successfully assigned ${successCount} properties`,
        assigned_properties: successCount,
        properties: assignedProperties,
      });
    }

    const assignResult = await assignResponse.json();

    console.log('✅ Onboarding complete:', {
      assigned: assignResult.assigned?.length || 0,
      errors: assignResult.errors?.length || 0
    });

    return NextResponse.json({
      success: true,
      message: 'Profile updated successfully',
      assigned_properties: assignResult.assigned?.length || property_ids.length,
      properties: assignResult.assigned,
      errors: assignResult.errors,
    });

  } catch (error) {
    console.error('Error in onboarding complete route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

