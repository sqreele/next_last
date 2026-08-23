import type { Property } from '@/app/lib/types';

export interface DetailedUser {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  positions: string;
  profile_image: string | null;
  properties: Property[];
  created_at: string;
}

interface DetailedUsersRequestOptions {
  accessToken: string;
  optional: boolean;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

export type DetailedUsersRequestResult =
  | { availability: 'available'; users: DetailedUser[] }
  | { availability: 'unavailable'; users: [] };

export function requestDetailedUsers(
  options: DetailedUsersRequestOptions,
): Promise<DetailedUsersRequestResult>;

export function isDetailedUsersAbortError(error: unknown): boolean;
