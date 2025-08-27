// app/api/test-nextauth-config/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from '@/app/lib/next-auth-compat.server';

export async function GET() {
  try {
    console.log('🧪 Testing Auth0 configuration...');
    
    // Check environment variables
    const envCheck = {
      AUTH0_SECRET: process.env.AUTH0_SECRET ? 'SET' : 'NOT_SET',
      AUTH0_BASE_URL: process.env.AUTH0_BASE_URL || 'NOT_SET',
      NODE_ENV: process.env.NODE_ENV || 'NOT_SET',
      NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'NOT_SET'
    };

    console.log('🧪 Environment variables:', envCheck);

    // Try to get session
    const session = await getServerSession();
    
    console.log('🧪 Session test result:', {
      hasSession: !!session,
      hasUser: !!session?.user,
      sessionError: session?.error,
      sessionKeys: session ? Object.keys(session) : []
    });

    // Test Auth0 endpoints availability
    const baseUrl = process.env.AUTH0_BASE_URL || 'http://localhost:3000';
    const testEndpoints = [
      `${baseUrl}/api/auth/session`,
      `${baseUrl}/api/auth/providers`,
      `${baseUrl}/api/auth/csrf`
    ];

    const result = {
      timestamp: new Date().toISOString(),
      environment: envCheck,
      session: {
        exists: !!session,
        hasUser: !!session?.user,
        error: session?.error
      },
      auth0Endpoints: testEndpoints,
      note: 'This tests Auth0 server-side configuration. Client-side errors may still occur if there are network issues.'
    };

    console.log('🧪 Auth0 config test result:', result);

    return NextResponse.json(result);

  } catch (error) {
    console.error('🧪 Auth0 config test error:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}
