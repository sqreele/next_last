import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/app/lib/session.server';
import { API_CONFIG } from '@/app/lib/config';
import type { DashboardSummaryResponse } from '@/app/dashboard/chartdashboard/types';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession();

    if (!session?.user?.accessToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const queryString = searchParams.toString();
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

    const payload: DashboardSummaryResponse = await response.json();
    return NextResponse.json(payload);
  } catch (error) {
    console.error('Error fetching dashboard summary:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
