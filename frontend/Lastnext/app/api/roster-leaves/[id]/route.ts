import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/app/lib/session.server';
import { API_CONFIG } from '@/app/lib/config';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession();

  if (!session?.user?.accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  const response = await fetch(`${API_CONFIG.baseUrl}/api/v1/roster-leaves/${id}/`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${session.user.accessToken}`,
    },
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: 'Failed to delete roster leave' },
      { status: response.status },
    );
  }

  return NextResponse.json({ success: true });
}
