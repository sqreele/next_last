export { getCompatServerSession as getServerSession } from '@/app/lib/auth0/session-compat';
export { useCompatSession as useSession } from '@/app/lib/auth-client';

export async function signIn() {
  if (typeof window !== 'undefined') {
    window.location.assign('/api/auth/login');
  }
}

export async function signOut() {
  if (typeof window !== 'undefined') {
    window.location.assign('/api/auth/logout');
  }
}

