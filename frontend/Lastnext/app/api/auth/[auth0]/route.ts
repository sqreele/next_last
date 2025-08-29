import { Auth0Client } from '@auth0/nextjs-auth0/server';

const auth0 = new Auth0Client();

export async function GET(request: Request) {
  return auth0.middleware(request as any);
}

export async function POST(request: Request) {
  return auth0.middleware(request as any);
}

