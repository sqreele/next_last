export const CSP_HEADER: "Content-Security-Policy";
export const CSP_NONCE_HEADER: "x-nonce";

export function buildContentSecurityPolicy(options: {
  nonce: string;
  isDevelopment?: boolean;
}): string;

export function createCspContext(options?: { isDevelopment?: boolean }): {
  nonce: string;
  policy: string;
};
