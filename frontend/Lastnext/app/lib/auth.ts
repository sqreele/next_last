// app/lib/auth.ts
import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import jwt, { JwtPayload } from "jsonwebtoken";
import { NextAuthOptions } from "next-auth";
import { prisma } from "@/app/lib/prisma";
import { UserProfile, Property } from "@/app/lib/types";
import { getUserProperties } from "./prisma-user-property";
import { refreshAccessToken } from "./auth-helpers";
import { API_CONFIG, AUTH_CONFIG, ERROR_TYPES } from "./config";
import { decodeToken, validateToken, getTokenExpiryTime } from "./utils/auth-utils";
import { getErrorMessage } from "./utils/error-utils";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) {
          console.error("🔐 Missing credentials");
          throw new Error("Missing credentials.");
        }

        try {
          console.log("🔐 Starting authentication for:", credentials.username);

          /** 🔹 Step 1: Get authentication tokens from API */
          const tokenResponse = await fetch(`${API_CONFIG.baseUrl}${API_CONFIG.endpoints.token}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(credentials),
          });

          console.log("🔐 Token response status:", tokenResponse.status);

          if (!tokenResponse.ok) {
            const errorText = await tokenResponse.text();
            console.error(`🔐 Token fetch failed: ${tokenResponse.status} - ${errorText}`);
            throw new Error("Invalid credentials.");
          }

          const tokenData = await tokenResponse.json();
          console.log("🔐 Token data received:", {
            hasAccess: !!tokenData.access,
            hasRefresh: !!tokenData.refresh,
            accessLength: tokenData.access?.length,
            refreshLength: tokenData.refresh?.length
          });

          if (!tokenData.access || !tokenData.refresh) {
            throw new Error("Token response missing access or refresh token.");
          }

          /** 🔹 Step 2: Decode JWT token to get user ID and expiry */
          if (!validateToken(tokenData.access)) {
            throw new Error("Invalid access token format.");
          }

          const decoded = decodeToken(tokenData.access);
          if (!decoded) {
            throw new Error("Failed to decode access token.");
          }

          const userId = String(decoded.user_id);
          const accessTokenExpires = getTokenExpiryTime(tokenData.access) || Date.now() + 60 * 60 * 1000;

          console.log("🔐 Token decoded:", {
            userId,
            expiresAt: new Date(accessTokenExpires).toISOString()
          });

          /** 🔹 Step 3: Fetch user from Prisma database */
          let user = await prisma.userProfile.findUnique({
            where: { userId: parseInt(userId) },
            include: { user: true }
          });

          /** 🔹 Step 4: Fetch user profile from API */
          let profileData: Partial<UserProfile> = {};
          const profileResponse = await fetch(`${API_CONFIG.baseUrl}${API_CONFIG.endpoints.userProfile}me/`, {
            headers: { Authorization: `Bearer ${tokenData.access}`, "Content-Type": "application/json" },
          });

          console.log("🔐 Profile API response status:", profileResponse.status);

          if (profileResponse.ok) {
            profileData = await profileResponse.json();
            console.log("🔐 Profile data fetched:", {
              hasProperties: !!profileData.properties,
              propertiesLength: profileData.properties?.length || 0,
              properties: profileData.properties
            });
          } else {
            const errorText = await profileResponse.text();
            console.error(`🔐 Profile fetch failed: ${profileResponse.status} - ${errorText}`);
          }

          /** 🔹 Step 5: Create or update user in Prisma */
          if (!user) {
            // First create the auth_user record
            const authUser = await prisma.authUser.upsert({
              where: { username: credentials.username },
              update: {
                email: profileData.email || credentials.username + '@example.com',
                is_active: true,
              },
              create: {
                username: credentials.username,
                email: profileData.email || credentials.username + '@example.com',
                password: 'django-hash-placeholder', // Django will handle password hashing
                first_name: credentials.username,
                last_name: '',
                is_active: true,
                is_staff: false,
                is_superuser: false,
              },
            });

            // Then create the userprofile record
            user = await prisma.userProfile.create({
              data: {
                userId: authUser.id,
                positions: profileData.positions || "User",
                profile_image: profileData.profile_image || null,
                access_token: tokenData.access,
                refresh_token: tokenData.refresh,
                email_verified: false,
                reset_password_used: false,
              },
              include: { user: true }
            });
            console.log("🔐 User created/updated in database");
          } else {
            // Update existing user profile
            user = await prisma.userProfile.update({
              where: { userId: parseInt(userId) },
              data: {
                access_token: tokenData.access,
                refresh_token: tokenData.refresh,
                positions: profileData.positions || user.positions || "User",
                profile_image: profileData.profile_image || user.profile_image,
              },
              include: { user: true }
            });
          }

          /** 🔹 Step 6: Normalize properties */
          let normalizedProperties: Property[] = [];
          
          if (profileData.properties && profileData.properties.length > 0) {
            console.log("🔐 Using API properties:", profileData.properties);
            normalizedProperties = profileData.properties.map((prop: any) => ({
              id: String(prop.id),
              property_id: String(prop.property_id || prop.id),
              name: prop.name || `Property ${prop.id}`,
              description: prop.description || "",
              created_at: prop.created_at || new Date().toISOString(),
              users: prop.users || [],
            }));
          } else {
            console.log("🔐 No API properties, trying Prisma...");
            try {
              normalizedProperties = await getUserProperties(userId);
              console.log("🔐 Prisma properties found:", normalizedProperties.length);
            } catch (error) {
              console.error("🔐 Failed to get properties from Prisma:", getErrorMessage(error));
              normalizedProperties = [];
            }
          }

          console.log("🔐 Properties normalized:", {
            count: normalizedProperties.length,
            properties: normalizedProperties.map(p => ({ id: p.property_id, name: p.name }))
          });

          /** 🔹 Step 7: Construct user profile */
          const userProfile: UserProfile = {
            id: userId,
            username: credentials.username,
            email: user.user.email || profileData.email || null,
            profile_image: user.profile_image || profileData.profile_image || null,
            positions: user.positions || profileData.positions || "User",
            properties: normalizedProperties,
            created_at: user.user.date_joined.toISOString() || profileData.created_at || new Date().toISOString(),
          };

          /** 🔹 Step 8: Return the user object with token expiry time */
          const returnUser = {
            ...userProfile,
            accessToken: tokenData.access,
            refreshToken: tokenData.refresh,
            accessTokenExpires: accessTokenExpires,
          };

          console.log("🔐 User authentication successful:", {
            userId: returnUser.id,
            username: returnUser.username,
            hasAccessToken: !!returnUser.accessToken,
            propertiesCount: returnUser.properties.length,
            propertiesData: returnUser.properties.map(p => ({ id: p.property_id, name: p.name }))
          });

          return returnUser;
        } catch (error) {
          console.error("🔐 Authorization Error:", error);
          throw new Error(`Unable to log in. ${getErrorMessage(error)}`);
        }
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user, account }) {
      console.log("🔐 JWT callback", {
        hasUser: !!user,
        hasToken: !!token,
        userKeys: user ? Object.keys(user) : [],
        tokenKeys: token ? Object.keys(token) : []
      });

      // Initial sign in
      if (user) {
        console.log("🔐 Initial sign in - setting token data");
        console.log("🔐 User properties being stored:", user.properties?.length || 0);
        
        const newToken = {
          ...token,
          id: user.id,
          username: user.username,
          email: user.email,
          profile_image: user.profile_image,
          positions: user.positions,
          properties: Array.isArray(user.properties) ? user.properties : [], // ✅ Ensure this is always an array
          created_at: user.created_at,
          accessToken: user.accessToken,
          refreshToken: user.refreshToken,
          accessTokenExpires: user.accessTokenExpires,
        };
        
        console.log("🔐 New token created", {
          hasAccessToken: !!newToken.accessToken,
          tokenLength: newToken.accessToken?.length,
          propertiesCount: newToken.properties.length, // ✅ Log properties count
          propertiesData: newToken.properties.map((p: any) => ({ id: p.property_id, name: p.name })),
          expiresAt: new Date(newToken.accessTokenExpires as number).toISOString()
        });
        
        return newToken;
      }

      // ✅ ADD: Ensure properties are preserved during token refresh
      if (!token.properties || !Array.isArray(token.properties)) {
        console.log("🔐 Token missing properties array, initializing as empty");
        token.properties = [];
      }

      // Check if token exists and has required properties
      if (!token?.accessToken || !token?.accessTokenExpires) {
        console.error("🔐 Token missing required properties", {
          hasAccessToken: !!token?.accessToken,
          hasExpires: !!token?.accessTokenExpires,
          tokenKeys: token ? Object.keys(token) : []
        });
        return { ...token, error: ERROR_TYPES.REFRESH_TOKEN_ERROR };
      }

      // Return previous token if the access token has not expired yet
      const now = Date.now();
      const expiresAt = token.accessTokenExpires as number;
      const timeUntilExpiry = expiresAt - now;
      
      console.log("🔐 Token expiry check", {
        now: new Date(now).toISOString(),
        expiresAt: new Date(expiresAt).toISOString(),
        timeUntilExpiry: Math.round(timeUntilExpiry / 1000 / 60) + " minutes",
        isExpired: now >= expiresAt,
        propertiesCount: (token.properties as any[])?.length || 0 // ✅ Log properties during refresh
      });

      if (now < expiresAt) {
        console.log("🔐 Token still valid, preserving properties:", (token.properties as any[])?.length || 0);
        return token;
      }

      // Access token has expired, try to update it
      console.log("🔐 Token expired, attempting refresh...");
      try {
        const refreshedToken = await refreshAccessToken(token.refreshToken as string);
        
        if (refreshedToken.error) {
          console.error("🔐 Token refresh failed:", refreshedToken.error);
          return { ...token, error: ERROR_TYPES.REFRESH_TOKEN_ERROR };
        }
        
        console.log("🔐 Token refreshed successfully, preserving properties:", (token.properties as any[])?.length || 0);
        return {
          ...token,
          accessToken: refreshedToken.accessToken,
          refreshToken: refreshedToken.refreshToken || token.refreshToken,
          accessTokenExpires: refreshedToken.accessTokenExpires,
          // ✅ Preserve properties during token refresh
          properties: token.properties,
          error: undefined // Clear any previous errors
        };
      } catch (error) {
        console.error("🔐 Token refresh error:", error);
        return { ...token, error: ERROR_TYPES.REFRESH_TOKEN_ERROR };
      }
    },

    async session({ session, token }) {
      console.log("🔐 Session callback triggered", {
        hasToken: !!token,
        tokenKeys: token ? Object.keys(token) : [],
        hasAccessToken: !!(token as any)?.accessToken,
        tokenError: (token as any)?.error,
        propertiesInToken: (token as any)?.properties?.length || 0 // ✅ Log properties count from token
      });

      // If token has an error, return it to trigger re-authentication
      if ((token as any)?.error) {
        console.error("🔐 Token error in session:", (token as any).error);
        return {
          ...session,
          error: (token as any).error as string,
          user: undefined // Clear user to force re-auth
        };
      }

      // Make sure we have required token data
      if (!(token as any)?.accessToken || !(token as any)?.id) {
        console.error("🔐 Missing required token data:", {
          hasAccessToken: !!(token as any)?.accessToken,
          hasId: !!(token as any)?.id,
          tokenKeys: token ? Object.keys(token) : []
        });
        return {
          ...session,
          error: "incomplete_token",
          user: undefined
        };
      }

      try {
        // ✅ Ensure properties is always an array
        const properties = (token as any).properties;
        const normalizedProperties = Array.isArray(properties) ? properties : [];

        console.log("🔐 Processing session properties:", {
          rawProperties: properties,
          isArray: Array.isArray(properties),
          normalizedCount: normalizedProperties.length,
          normalizedData: normalizedProperties.map((p: any) => ({ id: p?.property_id, name: p?.name }))
        });

        session.user = {
          id: (token as any).id as string,
          username: (token as any).username as string,
          email: (token as any).email as string | null,
          profile_image: (token as any).profile_image as string | null,
          positions: (token as any).positions as string,
          properties: normalizedProperties, // ✅ Use normalized properties
          created_at: (token as any).created_at as string,
          accessToken: (token as any).accessToken as string,
          refreshToken: (token as any).refreshToken as string,
        };

        console.log("🔐 Session created successfully", {
          userId: session.user.id,
          username: session.user.username,
          hasAccessToken: !!session.user.accessToken,
          tokenLength: session.user.accessToken?.length,
          propertiesCount: session.user.properties.length, // ✅ This should now show the correct count
          propertiesData: session.user.properties.map(p => ({ id: p.property_id, name: p.name })) // ✅ Log actual properties
        });

        return session;
      } catch (error) {
        console.error("🔐 Error creating session:", error);
        return {
          ...session,
          error: "session_creation_error",
          user: undefined
        };
      }
    },
  },

  events: {
    async signIn({ user }) {
      console.log(`🔐 User ${user.id} signed in successfully with ${user.properties?.length || 0} properties`);
    },
    async session({ session, token }) {
      if ((token as any).error === ERROR_TYPES.REFRESH_TOKEN_ERROR) {
        console.error(`🔐 Session error: Failed to refresh access token`);
      }
    },
  },

  pages: { 
    signIn: "/auth/signin",
    error: "/auth/error",
  },
  
  session: {
    strategy: "jwt",
    maxAge: AUTH_CONFIG.sessionMaxAge,
    updateAge: AUTH_CONFIG.sessionUpdateAge,
  },
  
  secret: process.env.NEXTAUTH_SECRET,
  debug: true, // Enable debug temporarily
  
  // Add error handling for development
  logger: {
    error(code, ...message) {
      console.error('🔐 NextAuth Error:', code, ...message);
    },
    warn(code, ...message) {
      console.warn('🔐 NextAuth Warning:', code, ...message);
    },
    debug(code, ...message) {
      if (process.env.NODE_ENV === 'development') {
        console.log('🔐 NextAuth Debug:', code, ...message);
      }
    },
  },
};

export default authOptions;
