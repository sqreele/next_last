import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function GET() {
  try {
    const cookieStore = await cookies();
    const auth0SessionCookie = cookieStore.get('auth0_session');
    
    if (!auth0SessionCookie?.value) {
      return NextResponse.json({
        status: 'no_session',
        message: 'No auth0_session cookie found',
        cookies: Array.from(cookieStore.getAll()).map(c => ({ name: c.name, hasValue: !!c.value }))
      });
    }

    try {
      const sessionData = JSON.parse(auth0SessionCookie.value);
      
      return NextResponse.json({
        status: 'session_found',
        message: 'Auth0 session cookie found and parsed successfully',
        session: {
          hasUser: !!sessionData?.user,
          userId: sessionData?.user?.id,
          username: sessionData?.user?.username,
          email: sessionData?.user?.email,
          profile_image: sessionData?.user?.profile_image,
          positions: sessionData?.user?.positions,
          hasAccessToken: !!sessionData?.user?.accessToken,
          accessTokenLength: sessionData?.user?.accessToken?.length,
          accessTokenExpires: sessionData?.user?.accessTokenExpires,
          isExpired: sessionData?.user?.accessTokenExpires ? Date.now() > sessionData.user.accessTokenExpires : false,
          created_at: sessionData?.user?.created_at,
          expires: sessionData?.expires,
          // Show all available user fields
          allUserFields: sessionData?.user ? Object.keys(sessionData.user) : [],
          // Show Auth0 profile data if available
          auth0_profile: sessionData?.user?.auth0_profile ? {
            hasAuth0Profile: true,
            auth0Fields: Object.keys(sessionData.user.auth0_profile),
            picture: sessionData?.user?.auth0_profile?.picture,
            name: sessionData?.user?.auth0_profile?.name,
            given_name: sessionData?.user?.auth0_profile?.given_name,
            family_name: sessionData?.user?.auth0_profile?.family_name
          } : { hasAuth0Profile: false }
        },
        allCookies: Array.from(cookieStore.getAll()).map(c => ({ name: c.name, hasValue: !!c.value }))
      });
    } catch (parseError) {
      return NextResponse.json({
        status: 'parse_error',
        message: 'Failed to parse auth0_session cookie',
        error: parseError instanceof Error ? parseError.message : 'Unknown error',
        cookieValue: auth0SessionCookie.value.substring(0, 100) + '...',
        allCookies: Array.from(cookieStore.getAll()).map(c => ({ name: c.name, hasValue: !!c.value }))
      }, { status: 400 });
    }
    
  } catch (error) {
    return NextResponse.json({
      status: 'error',
      message: 'Error checking session',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
