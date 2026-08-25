import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    { error: 'Password recovery is managed by Auth0 Universal Login.' },
    { status: 410 },
  );
}
