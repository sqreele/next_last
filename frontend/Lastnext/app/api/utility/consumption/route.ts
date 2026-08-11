import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/app/lib/session.server';
import { API_CONFIG } from '@/app/lib/config';
import { isUtilityConsumptionListResponse } from '@/app/lib/api/utility-consumption-contracts';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession();

    if (!session?.user?.accessToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    if (!searchParams.has('page_size')) searchParams.set('page_size', '100');
    const queryString = searchParams.toString();
    const apiUrl = `${API_CONFIG.baseUrl}/api/v1/utility-consumption/${queryString ? `?${queryString}` : ''}`;

    const response = await fetch(apiUrl, {
      headers: {
        Authorization: `Bearer ${session.user.accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.error('Failed to fetch utility consumption:', response.status, response.statusText);
      return NextResponse.json(
        { error: 'Failed to fetch utility consumption' },
        { status: response.status }
      );
    }

    const payload: unknown = await response.json();
    if (!isUtilityConsumptionListResponse(payload)) {
      console.error('Invalid utility consumption response contract');
      return NextResponse.json({ error: 'Invalid utility consumption response' }, { status: 502 });
    }
    return NextResponse.json(payload);
  } catch (error) {
    console.error('Error fetching utility consumption:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
