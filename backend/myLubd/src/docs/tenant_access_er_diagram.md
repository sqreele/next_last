# Tenant and Property Access ER Diagram

This diagram separates external authentication identity, invitation onboarding,
and application authorization. The canonical chains are:

```text
Auth0 JWT -> AuthIdentity -> Django User

Django User -> active TenantMembership -> Tenant -> Property grants
```

`AuthIdentity` proves which canonical user authenticated; it grants no tenant,
role, or property authority. A `TenantInvitation` proposes a role and optional
property grants, but authority begins only when acceptance creates or confirms
the canonical `TenantMembership`.

```mermaid
erDiagram
    USER {
        bigint id PK
        string username
        string email
        boolean is_active
        boolean is_staff
        boolean is_superuser
    }

    AUTH_IDENTITY {
        bigint id PK
        bigint user_id FK
        string issuer
        string subject
        string email_at_link "nullable"
        datetime created_at
        datetime last_seen_at
    }

    TENANT {
        bigint id PK
        string tenant_id UK
        string name
        string status
        bigint owner_id FK "nullable"
    }

    PROPERTY {
        int id PK
        string property_id UK
        string name
        bigint tenant_id FK "nullable"
    }

    TENANT_MEMBERSHIP {
        bigint id PK
        bigint tenant_id FK
        bigint user_id FK
        string role
        boolean is_active
    }

    TENANT_INVITATION {
        bigint id PK
        bigint tenant_id FK
        string email "normalized on save"
        string role
        bigint invited_by_id FK "nullable; SET_NULL"
        bigint accepted_by_id FK "nullable; PROTECT"
        string token_hash UK
        datetime expires_at
        datetime accepted_at "nullable"
        datetime revoked_at "nullable"
        datetime created_at
        datetime updated_at
    }

    TENANT_MEMBERSHIP_PROPERTY {
        bigint tenantmembership_id FK
        int property_id FK
    }

    TENANT_INVITATION_PROPERTY {
        bigint tenantinvitation_id FK
        int property_id FK
    }

    USER ||--o{ AUTH_IDENTITY : binds
    USER o|--o{ TENANT : owns
    TENANT o|--o{ PROPERTY : contains
    TENANT ||--o{ TENANT_MEMBERSHIP : has
    USER ||--o{ TENANT_MEMBERSHIP : receives
    TENANT_MEMBERSHIP ||--o{ TENANT_MEMBERSHIP_PROPERTY : grants
    PROPERTY ||--o{ TENANT_MEMBERSHIP_PROPERTY : permits
    TENANT ||--o{ TENANT_INVITATION : issues
    USER o|--o{ TENANT_INVITATION : creates
    USER o|--o{ TENANT_INVITATION : accepts
    TENANT_INVITATION ||--o{ TENANT_INVITATION_PROPERTY : proposes
    PROPERTY ||--o{ TENANT_INVITATION_PROPERTY : scopes
```

Authentication and onboarding semantics:

- `AuthIdentity` has a unique `(issuer, subject)` pair and a required `user`
  foreign key (`related_name="auth_identities"`). A user can have many identity
  bindings. `email_at_link` is historical link-time context; changing a
  presented email does not relink an existing identity.
- `TenantInvitation.email` is normalized on save. `token_hash` is unique, and
  the normalized email is unique while an invitation is unresolved
  (`accepted_at IS NULL` and `revoked_at IS NULL`).
- Reverse relations are `Tenant.invitations`,
  `User.created_tenant_invitations`, `User.accepted_tenant_invitations`, and
  `Property.tenant_invitations`.
- Acceptance requires `accepted_at` and `accepted_by` to be set together. An
  invitation cannot be both accepted and revoked. `accepted_by` uses `PROTECT`,
  preserving acceptance history; `invited_by` uses `SET_NULL`.
- Invitation properties must belong to the invitation tenant. They become
  canonical grants only through the accepted `TenantMembership`.

Authorization semantics:

- `owner`, `admin`, and `manager` are tenant-wide roles.
- `supervisor`, `technician`, and `viewer` require explicit
  `TenantMembership.properties` grants. `billing` may have optional grants and
  has no property access when none are assigned.
- Only active memberships participate in tenant/property authorization.
- `Property.tenant` is currently nullable. Tenant-backed properties use the
  membership chain above; nullability is not an alternate authorization path.
- `User.is_staff` is Django-admin eligibility and is not application
  authorization. `User.is_superuser` is the explicit platform break-glass
  bypass and is not represented by a membership grant.

Historical note: migration `0077` removed the retired `Property.users` and
`UserProfile.properties` relations. Migration `0076` had already removed
`Room.properties`. None of those historical relationships is an authorization
input in the current schema.
