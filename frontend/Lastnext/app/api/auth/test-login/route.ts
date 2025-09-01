import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Check if required environment variables are set
    const auth0Domain = process.env.AUTH0_DOMAIN;
    const clientId = process.env.AUTH0_CLIENT_ID;
    const clientSecret = process.env.AUTH0_CLIENT_SECRET;
    const baseUrl = process.env.AUTH0_BASE_URL || 'https://pcms.live';
    
    const configStatus = {
      domain: auth0Domain ? '✅ Set' : '❌ Missing',
      clientId: clientId ? '✅ Set' : '❌ Missing',
      clientSecret: clientSecret ? '✅ Set' : '❌ Missing',
      baseUrl: baseUrl ? '✅ Set' : '❌ Missing',
    };

    const hasAllRequired = auth0Domain && clientId && clientSecret;

    if (!hasAllRequired) {
      return NextResponse.json({
        status: 'error',
        message: 'Missing required Auth0 environment variables',
        config: configStatus,
        instructions: [
          'Set the following environment variables in your .env.local file:',
          'AUTH0_DOMAIN=your-domain.auth0.com',
          'AUTH0_CLIENT_ID=your-client-id',
          'AUTH0_CLIENT_SECRET=your-client-secret',
          'AUTH0_BASE_URL=https://pcms.live (or your environment base URL)'
        ]
      }, { status: 400 });
    }

    // Test Auth0 configuration
    const testLoginUrl = `https://${auth0Domain}/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(`${baseUrl}/api/auth/callback`)}&scope=openid profile email&audience=https://pcms.live/api`;

    return NextResponse.json({
      status: 'success',
      message: 'Auth0 configuration is valid',
      config: configStatus,
      testLoginUrl: testLoginUrl,
      nextSteps: [
        'Visit /auth/login to test the login flow',
        'Click "Continue with Auth0" to start authentication',
        'You should be redirected to Auth0 for login'
      ]
    });

  } catch (error) {
    console.error('Error testing Auth0 configuration:', error);
    return NextResponse.json({
      status: 'error',
      message: 'Error testing configuration',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
