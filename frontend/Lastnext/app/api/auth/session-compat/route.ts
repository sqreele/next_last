import { NextResponse } from 'next/server';
import { getCompatServerSession } from '@/app/lib/auth0/session-compat';

export async function GET() {
  try {
    const session = await getCompatServerSession();
    return NextResponse.json(session ?? { user: undefined }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ user: undefined, error: 'session_error' }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  }
}
