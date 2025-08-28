// Re-export the client auth hook for cleaner imports
export { useClientAuth0 } from './client-auth';
export type { CompatUser, CompatSession } from './session-compat';
export { auth0 } from '@/lib/auth0';
