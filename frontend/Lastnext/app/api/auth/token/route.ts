import { NextResponse } from 'next/server';

// Local username/password token exchange is intentionally retired. Application
// authentication starts at Auth0 Universal Login.
export async function POST() {
  return NextResponse.json(
    { error: 'Local application authentication is disabled.' },
    { status: 410 },
  );
}
