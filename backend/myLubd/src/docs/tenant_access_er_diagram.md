# Tenant and Property Access ER Diagram

This diagram documents the tenant/access boundary. Tenant-backed authorization
is derived from `TenantMembership` and its property grants. The former
`Property.users` and `UserProfile.properties` relations were removed by
migration `0077`.

```mermaid
erDiagram
    USER {
        bigint id PK
        string username
        string email
        boolean is_active
        boolean is_staff
    }

    TENANT {
        bigint id PK
        string tenant_id UK
        string name
        string status
        bigint owner_id FK
    }

    PROPERTY {
        bigint id PK
        string property_id UK
        string name
        bigint tenant_id FK
    }

    TENANT_MEMBERSHIP {
        bigint id PK
        bigint tenant_id FK
        bigint user_id FK
        string role
        boolean is_active
    }

    USER_PROFILE {
        bigint id PK
        bigint user_id FK
        string google_id
    }

    TENANT_MEMBERSHIP_PROPERTY {
        bigint tenantmembership_id FK
        bigint property_id FK
    }

    USER ||--o{ TENANT : owns
    TENANT ||--o{ PROPERTY : contains
    TENANT ||--o{ TENANT_MEMBERSHIP : has
    USER ||--o{ TENANT_MEMBERSHIP : receives
    TENANT_MEMBERSHIP ||--o{ TENANT_MEMBERSHIP_PROPERTY : grants
    PROPERTY ||--o{ TENANT_MEMBERSHIP_PROPERTY : permits
    USER ||--|| USER_PROFILE : has
```

Authorization semantics:

- `owner`, `admin`, and `manager` are tenant-wide roles.
- `supervisor`, `technician`, `viewer`, and `billing` are restricted to the
  `TenantMembership.properties` grants.
- The old direct property-user access paths no longer exist in the current
  schema; `TenantMembership.properties` is the canonical property grant.
- `User.is_staff` / `User.is_superuser` retain the application’s existing
  platform-admin bypass and are not represented by a TenantMembership grant.
