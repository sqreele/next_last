// This file is for client-side session compatibility
// Server-side session handling is done in the API route

import type { CurrentUserResponse } from "@/app/lib/api/current-user-contracts";
import type { Property } from "@/app/lib/types";

export interface CompatUser {
  /** Sanitized Auth0 subject; never a Django User/Profile primary key. */
  id: string;
  username: string;
  email: string | null;
  profile_image: string | null;
  positions: string;
  properties: Property[];
  accessToken: string;
  refreshToken?: string;
  accessTokenExpires?: number;
  first_name?: string | null;
  last_name?: string | null;
  created_at: string;
  auth0_profile?: {
    sub?: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
    given_name?: string;
    family_name?: string;
    nickname?: string;
    picture?: string;
    locale?: string;
    updated_at?: string;
  };
}

export interface CompatSession {
  user?: CompatUser;
  currentUser?: CurrentUserResponse;
  error?: string;
  expires?: string | number;
}

// This function is only used on the server side in the API route
// The client side gets sessions through the API endpoint
export async function getCompatServerSession(): Promise<CompatSession | null> {
  // This function should not be called from the client side
  // It's only used in the API route
  throw new Error('getCompatServerSession should not be called from client side');
}
