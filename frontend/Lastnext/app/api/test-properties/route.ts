import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function GET() {
  try {
    const cookieStore = await cookies();
    const auth0SessionCookie = cookieStore.get('auth0_session');
    
    if (!auth0SessionCookie?.value) {
      return NextResponse.json({
        status: 'no_session',
        message: 'No auth0_session cookie found'
      });
    }

    try {
      const sessionData = JSON.parse(auth0SessionCookie.value);
      
      if (!sessionData?.user?.accessToken) {
        return NextResponse.json({
          status: 'no_token',
          message: 'No access token found in session'
        });
      }

      // Try to fetch properties using the session-compat API
      try {
        const sessionResponse = await fetch(`${process.env.AUTH0_BASE_URL || 'https://pcms.live'}/api/auth/session-compat`, {
          headers: {
            'Cookie': `auth0_session=${auth0SessionCookie.value}`
          }
        });

        if (sessionResponse.ok) {
          const sessionResult = await sessionResponse.json();
          return NextResponse.json({
            status: 'success',
            message: 'Properties fetched via session-compat',
            properties: sessionResult?.user?.properties || [],
            propertiesCount: sessionResult?.user?.properties?.length || 0,
            sessionData: {
              userId: sessionResult?.user?.id,
              username: sessionResult?.user?.username,
              hasAccessToken: !!sessionResult?.user?.accessToken
            }
          });
        } else {
          return NextResponse.json({
            status: 'session_api_error',
            message: 'Failed to fetch from session-compat API',
            statusCode: sessionResponse.status,
            error: await sessionResponse.text()
          });
        }
      } catch (sessionError) {
        return NextResponse.json({
          status: 'session_fetch_error',
          message: 'Error calling session-compat API',
          error: sessionError instanceof Error ? sessionError.message : 'Unknown error'
        });
      }

    } catch (parseError) {
      return NextResponse.json({
        status: 'parse_error',
        message: 'Failed to parse auth0_session cookie',
        error: parseError instanceof Error ? parseError.message : 'Unknown error'
      });
    }
    
  } catch (error) {
    return NextResponse.json({
      status: 'error',
      message: 'Error testing properties',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
