export { useCompatSession as useSession } from '@/app/lib/auth-client';

export async function signIn() {
  if (typeof window !== 'undefined') {
    window.location.assign('/auth/login');
  }
}

export async function signOut() {
  if (typeof window !== 'undefined') {
    window.location.assign('/auth/logout');
  }
}

