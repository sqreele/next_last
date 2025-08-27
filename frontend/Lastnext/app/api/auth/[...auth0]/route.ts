import { handleAuth, handleLogin, handleCallback, handleLogout, handleProfile } from '@auth0/nextjs-auth0';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const audience = process.env.AUTH0_AUDIENCE;
const scope = 'openid profile email offline_access';

function buildHandler() {
  return handleAuth({
    login: handleLogin({
      authorizationParams: audience ? { audience, scope } : { scope },
    }),
    callback: handleCallback(),
    logout: handleLogout({
      returnTo: process.env.AUTH0_BASE_URL || 'http://localhost:3000',
    }),
    profile: handleProfile(),
  });
}

export async function GET(request: Request) {
  const handler = buildHandler();
  return (handler as any)(request);
}

export async function POST(request: Request) {
  const handler = buildHandler();
  return (handler as any)(request);
}
