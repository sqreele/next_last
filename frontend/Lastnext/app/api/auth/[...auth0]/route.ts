import { handleAuth, handleLogin, handleCallback, handleLogout, handleProfile } from '@auth0/nextjs-auth0';
import type { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const audience = process.env.AUTH0_AUDIENCE;
const scope = 'openid profile email offline_access';

const handler = handleAuth({
  login: handleLogin({
    authorizationParams: audience ? { audience, scope } : { scope },
  }),
  callback: handleCallback({}),
  logout: handleLogout({
    returnTo: process.env.AUTH0_BASE_URL || 'http://localhost:3000',
  }),
  profile: handleProfile({}),
});
export { handler as GET, handler as POST };
