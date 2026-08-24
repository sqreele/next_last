export const CSP_HEADER = "Content-Security-Policy";
export const CSP_NONCE_HEADER = "x-nonce";

const GOOGLE_PROFILE_IMAGE_ORIGINS = [
  "https://lh3.googleusercontent.com",
  "https://lh4.googleusercontent.com",
  "https://lh5.googleusercontent.com",
  "https://lh6.googleusercontent.com",
];

function createNonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let value = "";

  for (const byte of bytes) value += String.fromCharCode(byte);

  return btoa(value);
}

export function buildContentSecurityPolicy({ nonce, isDevelopment = false }) {
  if (!nonce) throw new Error("A per-request CSP nonce is required");

  const scriptSources = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
  ];
  const connectSources = ["'self'"];

  if (isDevelopment) {
    scriptSources.push("'unsafe-eval'");
    connectSources.push(
      "http://localhost:*",
      "http://127.0.0.1:*",
      "ws://localhost:*",
      "ws://127.0.0.1:*",
    );
  }

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    `script-src ${scriptSources.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    "style-src-attr 'unsafe-inline'",
    `img-src 'self' data: blob: ${GOOGLE_PROFILE_IMAGE_ORIGINS.join(" ")}`,
    "font-src 'self'",
    `connect-src ${connectSources.join(" ")}`,
    "frame-src 'none'",
    "worker-src 'self'",
    "media-src 'self'",
    "manifest-src 'self'",
  ].join("; ");
}

export function createCspContext({ isDevelopment = false } = {}) {
  const nonce = createNonce();
  return {
    nonce,
    policy: buildContentSecurityPolicy({ nonce, isDevelopment }),
  };
}
