// app/api/test-error-redirect/route.ts
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Simulate different error scenarios
    const testErrors = [
      'session_expired',
      'access_denied',
      'RefreshAccessTokenError',
      'CredentialsSignin',
      'network_error',
      'undefined',
      null
    ];

    const results = testErrors.map(error => {
      const url = new URL('/auth/error', 'http://localhost:3000');
      if (error) {
        url.searchParams.set('error', error);
      }
      
      return {
        error,
        url: url.toString(),
        hasErrorParam: url.searchParams.has('error'),
        errorValue: url.searchParams.get('error')
      };
    });

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      testResults: results,
      note: 'This tests how error parameters are handled in the error page URL'
    });

  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}
