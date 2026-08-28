# Application ER Diagram

This is the current logical data model derived from `myappLubd/models.py`.
Django's implicit `id` primary keys and implicit many-to-many junction tables
are omitted where that keeps the diagrams readable. `UK` means unique key.

## Tenant, identity, and access

```mermaid
erDiagram
    USER {
        bigint id PK
        string username UK
        string email
        string property_id "legacy attribute"
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
    USER_PROFILE {
        bigint id PK
        bigint user_id FK, UK
        string google_id
    }
    SESSION {
        bigint id PK
        bigint user_id FK
        string session_token UK
        datetime expires_at
    }
    PUSH_SUBSCRIPTION {
        bigint id PK
        bigint user_id FK
        string endpoint UK
    }
    TENANT {
        bigint id PK
        string tenant_id UK
        string name UK
        bigint owner_id FK "nullable"
        string status
    }
    SUBSCRIPTION_PLAN {
        bigint id PK
        string code UK
        string name
        decimal monthly_price
    }
    TENANT_SUBSCRIPTION {
        bigint id PK
        bigint tenant_id FK, UK
        bigint plan_id FK
        string status
    }
    TENANT_MEMBERSHIP {
        bigint id PK
        bigint tenant_id FK
        bigint user_id FK
        bigint invited_by_id FK "nullable"
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
    PROPERTY {
        int id PK
        bigint tenant_id FK "nullable"
        string property_id UK
        string name UK
    }
    USAGE_METRIC {
        bigint id PK
        bigint tenant_id FK
        date period_start
        date period_end
    }

    USER ||--o{ AUTH_IDENTITY : binds
    USER ||--o| USER_PROFILE : has
    USER ||--o{ SESSION : opens
    USER ||--o{ PUSH_SUBSCRIPTION : registers
    USER o|--o{ TENANT : owns
    TENANT ||--o| TENANT_SUBSCRIPTION : subscribes
    SUBSCRIPTION_PLAN ||--o{ TENANT_SUBSCRIPTION : defines
    TENANT ||--o{ TENANT_MEMBERSHIP : has
    USER ||--o{ TENANT_MEMBERSHIP : receives
    USER o|--o{ TENANT_MEMBERSHIP : invites
    TENANT_MEMBERSHIP }o--o{ PROPERTY : grants_access_to
    TENANT o|--o{ PROPERTY : contains
    TENANT ||--o{ TENANT_INVITATION : issues
    USER o|--o{ TENANT_INVITATION : creates
    USER o|--o{ TENANT_INVITATION : accepts
    TENANT_INVITATION }o--o{ PROPERTY : proposes_access_to
    TENANT ||--o{ USAGE_METRIC : measures
```

`AuthIdentity(issuer, subject)`, `TenantMembership(tenant, user)`, and
`UsageMetric(tenant, period_start, period_end)` are unique. `AuthIdentity` is
only the durable external-identity binding from a validated Auth0 JWT to a
canonical `User`; it grants no tenant or property access. A user may have many
external identities, and `email_at_link` records link-time context rather than
an authorization key.

`TenantInvitation.token_hash` is globally unique. The normalized `email` is
unique only while both `accepted_at` and `revoked_at` are null. Database checks
require `accepted_at` and `accepted_by` to be either both null or both set, and
prevent an invitation from being both accepted and revoked. Deleting an
accepting user is blocked by `accepted_by=PROTECT`; deleting an inviter sets
`invited_by` to null. Invitation properties use an implicit many-to-many
junction table and describe the grants proposed for acceptance.

`Property.tenant` remains nullable in the current model and migration state;
this is a current schema fact, not a transitional migration note. For
tenant-backed properties, application authorization is derived only from an
active `TenantMembership`: owner/admin/manager roles are tenant-wide and other
roles use the membership's property grants. Invitations do not grant access
until acceptance creates or confirms that canonical membership. The legacy
`User.property_id` attribute is not an authorization relationship. See
[tenant_access_er_diagram.md](tenant_access_er_diagram.md) for the complete
authentication and authorization boundary.

## Work orders and location

```mermaid
erDiagram
    USER { bigint id PK }
    PROPERTY { int id PK }
    ROOM {
        int room_id PK
        int property_id FK
        string name UK
    }
    AREA {
        int id PK
        int property_id FK
        string name
    }
    TOPIC {
        int id PK
        string title UK
    }
    JOB {
        bigint id PK
        string job_id UK
        bigint user_id FK
        bigint updated_by_id FK "nullable"
        int property_id FK
        int area_id FK "nullable"
        string status
    }
    JOB_IMAGE {
        bigint id PK
        bigint job_id FK
        bigint uploaded_by_id FK "nullable"
    }
    JOB_COMMENT {
        int id PK
        bigint job_id FK
        bigint author_id FK "nullable"
    }

    PROPERTY ||--o{ ROOM : contains
    PROPERTY ||--o{ AREA : divides_into
    PROPERTY ||--o{ JOB : receives
    AREA o|--o{ JOB : locates
    USER ||--o{ JOB : creates
    USER o|--o{ JOB : updates
    JOB }o--o{ ROOM : concerns
    JOB }o--o{ TOPIC : categorizes
    JOB ||--o{ JOB_IMAGE : has
    USER o|--o{ JOB_IMAGE : uploads
    JOB ||--o{ JOB_COMMENT : has
    USER o|--o{ JOB_COMMENT : authors
```

`Area(property, name)` is unique. `Job.rooms` and `Job.topics` use implicit
junction tables.

## Preventive maintenance and assets

```mermaid
erDiagram
    USER { bigint id PK }
    PROPERTY { int id PK }
    TOPIC { int id PK }
    JOB { bigint id PK }
    MACHINE {
        int id PK
        string machine_id UK
        int property_id FK
        string status
    }
    MAINTENANCE_PROCEDURE {
        bigint id PK
        string name
        string frequency
        json steps
    }
    PM_MASTER_PLAN {
        bigint id PK
        string plan_id UK
        bigint procedure_template_id FK "nullable"
        bigint assigned_to_id FK "nullable"
        bigint created_by_id FK
    }
    PREVENTIVE_MAINTENANCE {
        bigint id PK
        string pm_id UK
        bigint job_id FK "nullable"
        bigint master_plan_id FK "nullable"
        bigint procedure_template_id FK "nullable"
        bigint assigned_to_id FK "nullable"
        bigint created_by_id FK
        string status
    }
    PREVENTIVE_MAINTENANCE_IMAGE {
        int id PK
        bigint preventive_maintenance_id FK
        bigint uploaded_by_id FK "nullable"
    }
    MAINTENANCE_TASK_IMAGE {
        int id PK
        bigint task_id FK
        bigint uploaded_by_id FK "nullable"
    }
    MAINTENANCE_CHECKLIST {
        bigint id PK
        bigint maintenance_id FK
        bigint completed_by_id FK "nullable"
    }
    MAINTENANCE_HISTORY {
        bigint id PK
        bigint maintenance_id FK
        bigint performed_by_id FK "nullable"
    }
    MAINTENANCE_SCHEDULE {
        bigint id PK
        bigint maintenance_id FK, UK
        datetime next_occurrence
    }

    PROPERTY ||--o{ MACHINE : owns
    MACHINE }o--o{ MAINTENANCE_PROCEDURE : supports
    MACHINE }o--o{ PM_MASTER_PLAN : scheduled_by
    TOPIC }o--o{ PM_MASTER_PLAN : categorizes
    MAINTENANCE_PROCEDURE o|--o{ PM_MASTER_PLAN : templates
    USER o|--o{ PM_MASTER_PLAN : assigned
    USER ||--o{ PM_MASTER_PLAN : creates
    PM_MASTER_PLAN o|--o{ PREVENTIVE_MAINTENANCE : generates
    JOB o|--o{ PREVENTIVE_MAINTENANCE : represents
    TOPIC }o--o{ PREVENTIVE_MAINTENANCE : categorizes
    MACHINE }o--o{ PREVENTIVE_MAINTENANCE : receives
    MAINTENANCE_PROCEDURE o|--o{ PREVENTIVE_MAINTENANCE : templates
    USER o|--o{ PREVENTIVE_MAINTENANCE : assigned
    USER ||--o{ PREVENTIVE_MAINTENANCE : creates
    PREVENTIVE_MAINTENANCE ||--o{ PREVENTIVE_MAINTENANCE_IMAGE : has
    MAINTENANCE_PROCEDURE ||--o{ MAINTENANCE_TASK_IMAGE : illustrates
    PREVENTIVE_MAINTENANCE ||--o{ MAINTENANCE_CHECKLIST : checks
    PREVENTIVE_MAINTENANCE ||--o{ MAINTENANCE_HISTORY : records
    PREVENTIVE_MAINTENANCE ||--o| MAINTENANCE_SCHEDULE : schedules
```

Image, checklist, and history uploader/actor fields point to `User`.
`PreventiveMaintenance` also has optional `completed_by` and `verified_by`
links to `User`; they are omitted above to reduce crossing lines.

## Inventory, utilities, and reports

```mermaid
erDiagram
    USER { bigint id PK }
    PROPERTY { int id PK }
    ROOM { int room_id PK }
    TOPIC { int id PK }
    JOB { bigint id PK }
    PREVENTIVE_MAINTENANCE { bigint id PK }
    INVENTORY {
        int id PK
        string item_id UK
        int property_id FK "nullable"
        int room_id FK "nullable"
        bigint created_by_id FK "nullable"
        int quantity
    }
    INVENTORY_USAGE {
        bigint id PK
        int inventory_id FK
        bigint job_id FK "nullable"
        bigint preventive_maintenance_id FK "nullable"
        int property_id FK
        bigint consumed_by_id FK "nullable"
    }
    UTILITY_CONSUMPTION {
        int id PK
        int property_id FK "nullable"
        bigint created_by_id FK "nullable"
        int month
        int year
    }
    WORKSPACE_REPORT {
        int id PK
        string report_id UK
        int topic_id FK "nullable"
        int property_id FK "nullable"
        bigint created_by_id FK "nullable"
        bigint updated_by_id FK "nullable"
    }

    PROPERTY o|--o{ INVENTORY : stocks
    ROOM o|--o{ INVENTORY : stores
    USER o|--o{ INVENTORY : creates
    INVENTORY }o--o{ JOB : associated_with
    INVENTORY }o--o{ PREVENTIVE_MAINTENANCE : associated_with
    INVENTORY ||--o{ INVENTORY_USAGE : logs
    PROPERTY ||--o{ INVENTORY_USAGE : scopes
    JOB o|--o{ INVENTORY_USAGE : consumes_for
    PREVENTIVE_MAINTENANCE o|--o{ INVENTORY_USAGE : consumes_for
    USER o|--o{ INVENTORY_USAGE : consumes
    PROPERTY o|--o{ UTILITY_CONSUMPTION : measures
    USER o|--o{ UTILITY_CONSUMPTION : records
    PROPERTY o|--o{ WORKSPACE_REPORT : receives
    TOPIC o|--o{ WORKSPACE_REPORT : categorizes
    USER o|--o{ WORKSPACE_REPORT : creates_or_updates
```

`UtilityConsumption(property, month, year)` is unique. An `InventoryUsage`
may reference a job or preventive-maintenance task, but model validation rejects
referencing both at once.
