"use client";

import { useEffect, useState } from "react";
import { getAccessToken, useUser } from "@auth0/nextjs-auth0/client";

type ClientAuthUser = {
  id: string;
  username: string;
  email?: string;
  profile_image?: string;
  positions: string;
  properties: unknown[];
  accessToken: string;
  refreshToken: string;
  accessTokenExpires?: number;
  created_at: string;
};

export function useClientAuth0() {
  const auth0 = useUser();
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [tokenLoading, setTokenLoading] = useState(false);
  const [tokenError, setTokenError] = useState<Error | null>(null);
  const [user, setUser] = useState<ClientAuthUser | null>(null);

  useEffect(() => {
    if (auth0.isLoading) return;
    if (auth0.error) {
      setTokenError(auth0.error);
      return;
    }
    if (!auth0.user) {
      setUser(null);
      setAccessToken(null);
      return;
    }

    let cancelled = false;
    setTokenLoading(true);
    getAccessToken()
      .then((token) => {
        if (cancelled) return;
        const identity = auth0.user!;
        setAccessToken(token);
        setUser({
          id: identity.sub || identity.email || "user",
          username: identity.nickname || identity.name || identity.email || "user",
          email: identity.email,
          profile_image: identity.picture,
          positions: "User",
          properties: [],
          accessToken: token,
          refreshToken: "",
          created_at: new Date().toISOString(),
        });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setTokenError(error instanceof Error ? error : new Error("Unable to obtain an access token"));
        }
      })
      .finally(() => {
        if (!cancelled) setTokenLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [auth0.error, auth0.isLoading, auth0.user]);

  return {
    accessToken,
    isLoading: auth0.isLoading || tokenLoading,
    error: auth0.error || tokenError,
    user,
    isAuthenticated: Boolean(user),
  };
}
