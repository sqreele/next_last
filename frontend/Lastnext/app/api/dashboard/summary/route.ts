import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/app/lib/session.server';
import { API_CONFIG } from '@/app/lib/config';
import { dashboardSummaryQueryString, isDashboardSummaryResponse } from '@/app/lib/api/dashboard-analytics-contracts';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession();

    if (!session?.user?.accessToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const propertyId = searchParams.get('property_id');
    if (!propertyId) {
      return NextResponse.json({ error: 'property_id is required' }, { status: 400 });
    }
    const queryString = dashboardSummaryQueryString({ property_id: propertyId });
    const apiUrl = `${API_CONFIG.baseUrl}/api/v1/dashboard/summary/${queryString ? `?${queryString}` : ''}`;

    const response = await fetch(apiUrl, {
      headers: {
        Authorization: `Bearer ${session.user.accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.error('Failed to fetch dashboard summary:', response.status, response.statusText);
      return NextResponse.json(
        { error: 'Failed to fetch dashboard summary' },
        { status: response.status }
      );
    }

    const payload: unknown = await response.json();
    if (!isDashboardSummaryResponse(payload)) {
      console.error('Invalid dashboard summary response contract');
      return NextResponse.json({ error: 'Invalid dashboard summary response' }, { status: 502 });
    }
    return NextResponse.json(payload);
  } catch (error) {
    console.error('Error fetching dashboard summary:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
