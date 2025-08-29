import { NextResponse } from 'next/server';
import { getServerSession } from '@/app/lib/session.server';

export async function GET() {
  try {
    const session = await getServerSession();
    return NextResponse.json(session ?? { user: undefined }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ user: undefined, error: 'session_error' }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  }
}
