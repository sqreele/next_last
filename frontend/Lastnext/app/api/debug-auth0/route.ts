import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    // Check if Auth0 is configured
    const hasAuth0Config = Boolean(
      process.env.AUTH0_DOMAIN &&
      process.env.AUTH0_CLIENT_ID &&
      (process.env.AUTH0_CLIENT_SECRET || process.env.AUTH0_ISSUER_BASE_URL) &&
      process.env.AUTH0_SECRET
    );

    if (!hasAuth0Config) {
      return NextResponse.json({ 
        error: 'Auth0 not configured',
        message: 'Auth0 environment variables are missing'
      }, { status: 400 });
    }

    // Return basic Auth0 configuration info
    return NextResponse.json({
      success: true,
      auth0Config: {
        domain: process.env.AUTH0_DOMAIN,
        clientId: process.env.AUTH0_CLIENT_ID,
        hasClientSecret: !!process.env.AUTH0_CLIENT_SECRET,
        hasIssuerBaseUrl: !!process.env.AUTH0_ISSUER_BASE_URL,
        hasSecret: !!process.env.AUTH0_SECRET,
        baseUrl: process.env.AUTH0_BASE_URL,
        audience: process.env.AUTH0_AUDIENCE,
        scope: process.env.AUTH0_SCOPE,
      },
      message: 'Auth0 is configured but session handling is not yet implemented'
    });

  } catch (error) {
    console.error('Error in debug-auth0 endpoint:', error);
    return NextResponse.json({ 
      error: 'Failed to get Auth0 info',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
