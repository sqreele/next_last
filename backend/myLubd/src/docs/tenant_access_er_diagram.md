# Tenant and Property Access ER Diagram

This diagram documents the Phase A.3 tenant/access boundary. The two legacy
access relations remain in the schema for compatibility; tenant-backed
authorization is derived from `TenantMembership` and its property grants.

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

    PROPERTY_USER_LEGACY_ACCESS {
        bigint property_id FK
        bigint user_id FK
    }

    USER_PROFILE_PROPERTY_LEGACY_ACCESS {
        bigint userprofile_id FK
        bigint property_id FK
    }

    USER ||--o{ TENANT : owns
    TENANT ||--o{ PROPERTY : contains
    TENANT ||--o{ TENANT_MEMBERSHIP : has
    USER ||--o{ TENANT_MEMBERSHIP : receives
    TENANT_MEMBERSHIP ||--o{ TENANT_MEMBERSHIP_PROPERTY : grants
    PROPERTY ||--o{ TENANT_MEMBERSHIP_PROPERTY : permits
    USER ||--|| USER_PROFILE : has
    USER ||--o{ PROPERTY_USER_LEGACY_ACCESS : legacy_direct_access
    PROPERTY ||--o{ PROPERTY_USER_LEGACY_ACCESS : legacy_direct_access
    USER_PROFILE ||--o{ USER_PROFILE_PROPERTY_LEGACY_ACCESS : legacy_profile_access
    PROPERTY ||--o{ USER_PROFILE_PROPERTY_LEGACY_ACCESS : legacy_profile_access
```

Authorization semantics:

- `owner`, `admin`, and `manager` are tenant-wide roles.
- `supervisor`, `technician`, `viewer`, and `billing` are restricted to the
  `TenantMembership.properties` grants.
- `Property.users` and `UserProfile.properties` are legacy compatibility
  paths. They are not the canonical authorization source for tenant-backed
  properties.
- `User.is_staff` / `User.is_superuser` retain the application’s existing
  platform-admin bypass and are not represented by a TenantMembership grant.
