'use client'

export { useCompatSession as useSession } from '@/app/lib/auth-client';
import { appSignOut } from '@/app/lib/logout';

export async function signIn() {
  if (typeof window !== 'undefined') {
    window.location.assign('/auth/login');
  }
}

export async function signOut() {
  await appSignOut();
}
