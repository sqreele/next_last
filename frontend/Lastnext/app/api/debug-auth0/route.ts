import { NextRequest, NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';

export async function GET(request: NextRequest) {
  try {
    // Get the Auth0 access token using the new v4 API
    const session = await auth0.getSession();
    
    if (!session?.user) {
      return NextResponse.json({ 
        error: 'No user session available',
        message: 'Auth0 user session is missing'
      }, { status: 401 });
    }

    // In v4, we need to get the access token differently
    // For now, we'll return the user session info
    return NextResponse.json({
      success: true,
      sessionInfo: {
        hasSession: !!session,
        user: {
          sub: session.user.sub,
          email: session.user.email,
          name: session.user.name,
          nickname: session.user.nickname,
          picture: session.user.picture,
        },
        // Note: Access tokens are handled differently in v4
        // You may need to implement a separate endpoint for access tokens
      }
    });

  } catch (error) {
    console.error('Error in debug-auth0 endpoint:', error);
    return NextResponse.json({ 
      error: 'Failed to get session info',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
