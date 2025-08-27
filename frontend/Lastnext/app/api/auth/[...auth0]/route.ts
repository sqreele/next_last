import { handleAuth, handleLogin, handleCallback, handleLogout, handleProfile } from '@auth0/nextjs-auth0';

const audience = process.env.AUTH0_AUDIENCE;
const scope = 'openid profile email offline_access';

export const GET = handleAuth({
  login: handleLogin({
    authorizationParams: audience
      ? { audience, scope }
      : { scope },
  }),
  callback: handleCallback(),
  logout: handleLogout(),
  profile: handleProfile(),
});

export const POST = GET;
