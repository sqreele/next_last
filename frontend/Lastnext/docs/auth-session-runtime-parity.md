# Auth session runtime parity

This checklist records the Redis-backed v2 session contract observed in the
production image and represented by the checked-out source. It contains no
runtime credentials or session values.

| Concern | Production image | Checked-out source | Status |
| --- | --- | --- | --- |
| Cookie format | `v2.` plus a 43-character base64url reference | `session-reference.mjs` uses the same format and strict validator | Match |
| Cookie contents | Opaque 46-byte reference; no tokens | `session-cookie.ts` stores only the reference | Match |
| Cookie flags | HttpOnly, Secure, SameSite=Lax, Path=/ | Same | Match |
| Redis key | `auth:session:<reference>` | Same | Match |
| Redis configuration | `REDIS_URL`; password from URL; URL path selects DB | Same | Match |
| Redis transport | Node `net.Socket`, RESP, 1500 ms timeout, no TLS | Same | Match |
| Stored value | JSON session encrypted with AES-256-GCM and a SHA-256-derived session key | Same | Match |
| Stored format | `v1.<iv>.<tag>.<ciphertext>` | Same | Match |
| Create | `SET ... EX <ttl> NX` before setting cookie | Same | Match |
| Read | `GET`, decrypt, validate user/token expiry | Same | Match |
| Refresh | `SET ... EX <ttl> XX`; browser receives expiry only | Same | Match |
| Delete | `DEL` during logout, then clear cookie | Same | Match |
| Maximum TTL | 5,184,000 seconds (60 days) | Same, with cookie TTL also capped | Intentional tightening |
| Missing/malformed reference | Unauthenticated; Redis not queried | Same | Match |
| Missing/failed Redis | `store_unavailable`, fail closed | Same; refresh also returns an explicit 503 | Intentional tightening |
| Edge middleware | Shape-check reference and defer Redis to Node routes | Same, while retaining source CSP headers | Match plus retained hardening |
| Client session response | Access and refresh tokens omitted | Same | Match |
| Auth0 callback | State, nonce, PKCE and ID-token validation; Redis write precedes cookie | Same | Match |
| Tenant/property authority | Backend-authorized membership/property projection | Unchanged; Redis restoration does not grant membership | Match |

The intentional tightenings do not alter valid-session behavior. They prevent a
cookie from outliving the maximum Redis TTL and classify refresh-store failures
without exposing Redis or authentication details.
