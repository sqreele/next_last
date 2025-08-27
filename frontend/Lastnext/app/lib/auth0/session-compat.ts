// This file is for client-side session compatibility
// Server-side session handling is done in the API route

export interface CompatUser {
  id: string;
  username: string;
  email: string | null;
  profile_image: string | null;
  positions: string;
  properties: any[];
  accessToken: string;
  refreshToken: string;
  accessTokenExpires?: number;
  created_at: string;
}

export interface CompatSession {
  user?: CompatUser;
  error?: string;
  expires?: string;
}

// This function is only used on the server side in the API route
// The client side gets sessions through the API endpoint
export async function getCompatServerSession(): Promise<CompatSession | null> {
  // This function should not be called from the client side
  // It's only used in the API route
  throw new Error('getCompatServerSession should not be called from client side');
}

