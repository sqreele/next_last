// app/api/test-nextauth-config/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import authOptions from '@/app/lib/auth';

export async function GET() {
  try {
    console.log('🧪 Testing NextAuth configuration...');
    
    // Check environment variables
    const envCheck = {
      NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET ? 'SET' : 'NOT_SET',
      NEXTAUTH_URL: process.env.NEXTAUTH_URL || 'NOT_SET',
      NODE_ENV: process.env.NODE_ENV || 'NOT_SET',
      NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'NOT_SET'
    };

    console.log('🧪 Environment variables:', envCheck);

    // Try to get session
    const session = await getServerSession(authOptions);
    
    console.log('🧪 Session test result:', {
      hasSession: !!session,
      hasUser: !!session?.user,
      sessionError: session?.error,
      sessionKeys: session ? Object.keys(session) : []
    });

    // Test NextAuth endpoints availability
    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
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
      nextAuthEndpoints: testEndpoints,
      note: 'This tests NextAuth server-side configuration. Client-side errors may still occur if there are network issues.'
    };

    console.log('🧪 NextAuth config test result:', result);

    return NextResponse.json(result);

  } catch (error) {
    console.error('🧪 NextAuth config test error:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}
