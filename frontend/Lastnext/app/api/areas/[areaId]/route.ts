// app/api/areas/[areaId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/app/lib/session.server';
import { API_CONFIG } from '@/app/lib/config';

async function proxy(
  request: NextRequest,
  areaId: string,
  method: 'GET' | 'PATCH' | 'PUT' | 'DELETE',
) {
  const session = await getServerSession();
  if (!session?.user?.accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const init: RequestInit = {
    method,
    headers: {
      'Authorization': `Bearer ${session.user.accessToken}`,
      'Content-Type': 'application/json',
    },
  };
  if (method === 'PATCH' || method === 'PUT') {
    const body = await request.json();
    init.body = JSON.stringify(body);
  }

  const response = await fetch(`${API_CONFIG.baseUrl}/api/v1/areas/${areaId}/`, init);
  const text = await response.text();
  const data = text ? (() => { try { return JSON.parse(text); } catch { return { detail: text }; } })() : {};
  return NextResponse.json(data, { status: response.status });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ areaId: string }> }) {
  const { areaId } = await params;
  return proxy(request, areaId, 'GET');
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ areaId: string }> }) {
  const { areaId } = await params;
  return proxy(request, areaId, 'PATCH');
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ areaId: string }> }) {
  const { areaId } = await params;
  return proxy(request, areaId, 'PUT');
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ areaId: string }> }) {
  const { areaId } = await params;
  return proxy(request, areaId, 'DELETE');
}
