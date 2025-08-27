import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export default function middleware(_req: NextRequest) {
  // Auth enforcement is handled in server components and API routes.
  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*'],
};
