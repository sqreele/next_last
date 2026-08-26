import { NextRequest, NextResponse } from 'next/server';
import { beginHardenedAuth0Login } from '@/app/lib/auth0/login-flow';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    if (action === 'login') return beginHardenedAuth0Login(request);
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Auth0 error:', error);
    return NextResponse.json({ error: 'Authentication failed' }, { status: 500 });
  }
}

export async function POST() {
  return NextResponse.json({ error: 'Unsupported authentication action' }, { status: 405 });
}
