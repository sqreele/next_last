export { useCompatSession as useSession } from '@/app/lib/auth-client';
export { appSignOut as signOut } from '@/app/lib/logout';
export async function signIn() {
  if (typeof window !== 'undefined') window.location.assign('/auth/login');
}

