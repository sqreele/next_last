// app/api/debug-auth-flow/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/app/lib/next-auth-compat.server';

export async function GET(request: NextRequest) {
  try {
    console.log('🧪 Auth Flow Debug - Request started');
    
    // Get the full URL and search params
    const url = new URL(request.url);
    const searchParams = Object.fromEntries(url.searchParams.entries());
    
    console.log('🧪 Request details:', {
      url: request.url,
      searchParams,
      headers: Object.fromEntries(request.headers.entries())
    });

    // Try to get session
    const session = await getServerSession();
    
    console.log('🧪 Session result:', {
      hasSession: !!session,
      hasUser: !!session?.user,
      hasAccessToken: !!session?.user?.accessToken,
      sessionError: session?.error,
      sessionKeys: session ? Object.keys(session) : [],
      userKeys: session?.user ? Object.keys(session.user) : []
    });

    // Check for any cookies that might be related to the error
    const cookies = request.headers.get('cookie');

    const result = {
      timestamp: new Date().toISOString(),
      request: {
        url: request.url,
        searchParams,
        hasCookies: !!cookies,
        cookieCount: cookies ? cookies.split(';').length : 0
      },
      session: {
        exists: !!session,
        hasUser: !!session?.user,
        hasAccessToken: !!session?.user?.accessToken,
        error: session?.error,
        userId: session?.user?.id,
        username: session?.user?.username,
        tokenLength: session?.user?.accessToken?.length,
        propertiesCount: session?.user?.properties?.length
      },
      environment: {
        nodeEnv: process.env.NODE_ENV,
        hasAuth0Secret: !!process.env.AUTH0_SECRET,
        auth0BaseUrl: process.env.AUTH0_BASE_URL,
        apiUrl: process.env.NEXT_PUBLIC_API_URL
      }
    };

    console.log('🧪 Auth Flow Debug result:', result);

    return NextResponse.json(result);

  } catch (error) {
    console.error('🧪 Auth Flow Debug error:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}
