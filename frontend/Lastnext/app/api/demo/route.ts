import { NextRequest } from 'next/server';

import { proxyDemoRequest } from '@/app/lib/demo-api-proxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(request: NextRequest) {
  return proxyDemoRequest(request, '/api/v1/demo/', 'GET');
}

export function POST(request: NextRequest) {
  return proxyDemoRequest(request, '/api/v1/demo/', 'POST');
}
