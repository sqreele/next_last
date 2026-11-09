import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/app/lib/session.server';
import { API_CONFIG } from '@/app/lib/config';
import { backendFetch } from '@/app/lib/backend-fetch';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ propertyId: string }> }
) {
  const session = await getServerSession();
  if (!session?.user?.accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  let body;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!body || typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 255
      || typeof body.description !== 'string') {
    return NextResponse.json({ error: 'Enter a property name and description.' }, { status: 400 });
  }
  try {
    const { propertyId } = await params;
    const response = await backendFetch(`${API_CONFIG.baseUrl}/api/v1/properties/${encodeURIComponent(propertyId)}/`, {
      method: 'PATCH', cache: 'no-store',
      headers: { Authorization: `Bearer ${session.user.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: body.name.trim(), description: body.description.trim() }),
    });
    return NextResponse.json(await response.json(), { status: response.status, headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return NextResponse.json({ error: 'Unable to save property. Please try again.' }, { status: 502 });
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ propertyId: string }> }
) {
  try {
    // Get session to verify authentication
    const session = await getServerSession();
    
    if (!session?.user?.accessToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { propertyId } = await params;

    // Fetch property from the external API
    const response = await backendFetch(
      `${API_CONFIG.baseUrl}/api/v1/properties/${propertyId}/`,
      {
        headers: {
          'Authorization': `Bearer ${session.user.accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      console.error('Failed to fetch property:', response.status, response.statusText);
      return NextResponse.json(
        { error: 'Failed to fetch property' }, 
        { status: response.status }
      );
    }

    const property = await response.json();
    return NextResponse.json(property);

  } catch (error) {
    console.error('Error fetching property:', error);
    return NextResponse.json(
      { error: 'Internal server error' }, 
      { status: 500 }
    );
  }
}
