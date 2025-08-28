import { NextResponse } from 'next/server';

export async function GET() {
  const domain = process.env.AUTH0_DOMAIN || null;
  const issuerBaseUrl = process.env.AUTH0_ISSUER_BASE_URL || null;
  const appBaseUrl = process.env.APP_BASE_URL || process.env.AUTH0_BASE_URL || null;
  const clientId = process.env.AUTH0_CLIENT_ID || null;

  const maskedClientId = clientId ? `${clientId.slice(0, 2)}...${clientId.slice(-4)}` : null;

  return NextResponse.json(
    {
      domain,
      issuerBaseUrl,
      appBaseUrl,
      clientIdMasked: maskedClientId,
      hasSecret: Boolean(process.env.AUTH0_SECRET),
      nodeEnv: process.env.NODE_ENV,
    },
    { status: 200 },
  );
}

