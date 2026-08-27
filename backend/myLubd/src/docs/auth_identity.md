# Auth0 identity and application authorization

Authentication identity is bound durably by the exact pair `(issuer, subject)`:

```text
Auth0 JWT (iss, sub)
        |
        v
AuthIdentity (UNIQUE issuer, subject)
        |
        v
      User
        |
        v
TenantMembership -> Tenant -> Property grants
```

`AuthIdentity` is the identity authority after the first successful link. A
verified email is required only to bootstrap a new binding to exactly one
pre-provisioned Django user. Email changes do not relink an existing identity.

TenantMembership and property grants remain the application authorization
authority. `is_staff` remains Django admin eligibility and `is_superuser` remains
the platform break-glass role; neither is derived from Auth0 claims.
