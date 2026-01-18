import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/app/lib/session.server';
import { API_CONFIG } from '@/app/lib/config';
import type { MonthName, UtilityConsumptionRow } from '@/app/dashboard/utility-consumption/types';

const months: MonthName[] = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

type UtilityConsumptionApiRow = Omit<UtilityConsumptionRow, 'month'> & {
  month: number;
  month_display?: MonthName;
};

function mapMonthName(value?: number | null): MonthName {
  if (!value || value < 1 || value > 12) return 'January';
  return months[value - 1];
}

function normalizeRows(rows: UtilityConsumptionApiRow[]): UtilityConsumptionRow[] {
  return rows.map((row) => ({
    ...row,
    month: row.month_display ?? mapMonthName(row.month),
  }));
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession();

    if (!session?.user?.accessToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    if (!searchParams.has('page_size')) {
      searchParams.set('page_size', '1000');
    }
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

    const payload = await response.json();
    const rawRows: UtilityConsumptionApiRow[] = Array.isArray(payload)
      ? payload
      : payload.results ?? [];
    return NextResponse.json(normalizeRows(rawRows));
  } catch (error) {
    console.error('Error fetching utility consumption:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
