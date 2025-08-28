import { NextResponse } from 'next/server';

export async function GET() {
  // Redirect to dynamic auth handler which builds proper Auth0 URL
  return NextResponse.redirect('/api/auth?action=login');
}
