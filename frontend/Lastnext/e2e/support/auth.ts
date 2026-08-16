import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { request, type FullConfig } from "@playwright/test";

type LoginResponse = {
  access: string;
  user_id: number;
};

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for authenticated E2E setup.`);
  return value;
}

function sealSession(session: object, secret: string): string {
  const iv = randomBytes(12);
  const key = createHash("sha256").update(secret).digest();
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(session), "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

export async function createAuthenticatedStorageState(config: FullConfig) {
  const baseURL = required("E2E_BASE_URL");
  const apiURL = required("E2E_API_URL");
  const username = required("E2E_USERNAME");
  const password = required("E2E_PASSWORD");
  const sessionSecret = required("E2E_SESSION_SECRET");
  const email = process.env.E2E_EMAIL?.trim() || `${username}@example.invalid`;

  const api = await request.newContext({ baseURL: apiURL });
  try {
    const response = await api.post("/api/v1/auth/login/", {
      data: { username, password },
    });
    if (!response.ok()) {
      throw new Error(`Backend E2E login failed with HTTP ${response.status()}.`);
    }
    const login = (await response.json()) as Partial<LoginResponse>;
    if (!login.access || !login.user_id) {
      throw new Error("Backend E2E login response is missing access or user_id.");
    }

    const expiresAt = Date.now() + 25 * 60 * 1000;
    const session = {
      user: {
        id: String(login.user_id),
        username,
        email,
        profile_image: null,
        positions: "E2E User",
        properties: [],
        accessToken: login.access,
        accessTokenExpires: expiresAt,
        created_at: new Date().toISOString(),
      },
      expires: expiresAt,
    };
    const appURL = new URL(baseURL);
    const statePath = config.projects[0]?.use.storageState;
    if (typeof statePath !== "string") {
      throw new Error("Playwright storageState path is not configured.");
    }

    return {
      statePath,
      state: {
        cookies: [
          {
            name: "auth0_session",
            value: sealSession(session, sessionSecret),
            domain: appURL.hostname,
            path: "/",
            expires: Math.floor(expiresAt / 1000),
            httpOnly: true,
            secure: appURL.protocol === "https:",
            sameSite: "Lax" as const,
          },
        ],
        origins: [],
      },
    };
  } finally {
    await api.dispose();
  }
}
