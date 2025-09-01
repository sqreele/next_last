import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Check environment variables
    const domain = process.env.AUTH0_DOMAIN;
    const clientId = process.env.AUTH0_CLIENT_ID;
    const clientSecret = process.env.AUTH0_CLIENT_SECRET;
    const audience = process.env.AUTH0_AUDIENCE || 'https://pcms.live/api';
    const baseUrl = process.env.AUTH0_BASE_URL || 'https://pcms.live';
    
    if (!domain || !clientId || !clientSecret) {
      return NextResponse.json({
        status: 'error',
        message: 'Missing required Auth0 environment variables',
        config: {
          domain: domain ? '✅ Set' : '❌ Missing',
          clientId: clientId ? '✅ Set' : '❌ Missing',
          clientSecret: clientSecret ? '✅ Set' : '❌ Missing',
          audience: audience ? '✅ Set' : '❌ Missing',
          baseUrl: baseUrl ? '✅ Set' : '❌ Missing'
        }
      }, { status: 400 });
    }

    // Test Auth0 endpoints
    const testResults: any = {
      domain: `https://${domain}`,
      clientId,
      audience,
      baseUrl,
      endpoints: {},
      commonIssues: []
    };

    try {
      // Test 1: Check if Auth0 domain is accessible
      const domainResponse = await fetch(`https://${domain}/.well-known/openid_configuration`);
      if (domainResponse.ok) {
        const config = await domainResponse.json();
        testResults.endpoints.openid_config = {
          status: '✅ Accessible',
          userinfo_endpoint: config.userinfo_endpoint,
          authorization_endpoint: config.authorization_endpoint,
          token_endpoint: config.token_endpoint
        };
      } else {
        testResults.endpoints.openid_config = {
          status: '❌ Failed',
          statusCode: domainResponse.status,
          error: 'Cannot access Auth0 domain'
        };
      }
    } catch (error) {
      testResults.endpoints.openid_config = {
        status: '❌ Error',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }

    try {
      // Test 2: Check if we can access the userinfo endpoint (without auth)
      const userinfoResponse = await fetch(`https://${domain}/userinfo`);
      testResults.endpoints.userinfo = {
        status: userinfoResponse.status === 401 ? '✅ Protected (requires auth)' : '⚠️ Unexpected status',
        statusCode: userinfoResponse.status,
        note: userinfoResponse.status === 401 ? 'This is expected - userinfo should require authentication' : 'Should return 401 for unauthenticated requests'
      };
    } catch (error) {
      testResults.endpoints.userinfo = {
        status: '❌ Error',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }

    // Test 3: Build test URLs
    const testLoginUrl = `https://${domain}/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(`${baseUrl}/api/auth/callback`)}&scope=openid profile email&audience=${encodeURIComponent(audience)}`;
    
    testResults.testUrls = {
      login: testLoginUrl,
      callback: `${baseUrl}/api/auth/callback`
    };

    // Test 4: Check common Auth0 configuration issues
    
    if (!domain.includes('.auth0.com') && !domain.includes('.auth0.com.au')) {
      testResults.commonIssues.push('Domain format looks unusual - should be like "your-app.auth0.com"');
    }
    
    if (audience === 'https://pcms.live/api') {
      testResults.commonIssues.push('Using default audience - make sure this matches your Auth0 API configuration');
    }
    
    if (baseUrl === 'http://localhost:3000') {
      testResults.commonIssues.push('Using localhost - make sure this matches your Auth0 app settings');
    }

    // Test 5: Check if profile scope is properly configured
    const requiredScopes = ['openid', 'profile', 'email'];
    
    testResults.scopeGuidance = {
      required: requiredScopes,
      note: 'Make sure your Auth0 app has these scopes enabled',
      explanation: {
        openid: 'Required for OpenID Connect authentication',
        profile: 'Required to access user profile data (name, picture, etc.)',
        email: 'Required to access user email address'
      }
    };

    return NextResponse.json({
      status: 'success',
      message: 'Auth0 configuration test completed',
      results: testResults,
      nextSteps: [
        'Check the endpoints status above',
        'Verify your Auth0 app settings match the configuration',
        'Ensure your Auth0 app has the correct callback URLs',
        'Check that your Auth0 app has the required scopes (openid profile email)',
        'Verify your Auth0 API has the correct audience'
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
