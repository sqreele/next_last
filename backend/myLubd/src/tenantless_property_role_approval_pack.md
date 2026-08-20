# Phase A.3a-2 — Role & Access Approval Worksheet

Target tenant: `TD2ACC623` — Lub d  
Chinatown (`C`): `PB749146D` — Lubd Bangkok Chinatown  
Siam (`S`): `PE17D8D2C` — Lub d Bangkok Siam

## Canonical role choices and property effect

| Role | Tenant-wide? | Effect |
| --- | ---: | --- |
| owner | YES | Access all properties in the tenant. |
| admin | YES | Access all properties in the tenant. |
| manager | YES | Access all properties in the tenant. |
| supervisor | NO | Access only `membership.properties`. |
| technician | NO | Access only `membership.properties`. |
| viewer | NO | Access only `membership.properties`. |
| billing | NO | Access only `membership.properties`. |

For a tenant-wide role, C-only flags do **not** create C-only access. The
simulator derives C+S from the tenant. Property-restricted roles derive access
only from the explicit approved property flags.

## Approval matrix

| User | Legacy Access | Existing Role | Allowed Decision | Approved Role | Expansion Approved | Status |
| ---: | --- | --- | --- | --- | --- | --- |
| 1 | C | — | Retire legacy access; preserve User/history | NONE | NO | APPROVED_RETIREMENT |
| 5 | S | — | Retire legacy access; preserve User/history | NONE | NO | APPROVED_RETIREMENT |
| 8 | C+S | admin | Preserve admin | admin | NO | APPROVED |
| 9 | C | technician | Preserve technician | technician | NO | APPROVED |
| 10 | C | technician | Preserve technician | technician | NO | APPROVED |
| 11 | C | technician | Preserve technician | technician | NO | APPROVED |
| 12 | C+S | — | Retire legacy access; preserve User/history | NONE | NO | APPROVED_RETIREMENT |
| 14 | C | — | Retire legacy access; preserve User/history | NONE | NO | APPROVED_RETIREMENT |
| 15 | S | manager | Approved reduction: manager → supervisor, Siam only | supervisor | NO | APPROVED |
| 16 | C | manager | Approved reduction: manager → supervisor, Chinatown only | supervisor | NO | APPROVED |
| 17 | S | — | Retire legacy access; preserve User/history | NONE | NO | APPROVED_RETIREMENT |
| 18 | S | — | Retire legacy access; preserve User/history | NONE | NO | APPROVED_RETIREMENT |
| 20 | C | technician | Preserve technician | technician | NO | APPROVED |
| 21 | C | — | Retire legacy access; preserve User/history | NONE | NO | APPROVED_RETIREMENT |
| 22 | C+S | — | Retire legacy access; preserve User/history | NONE | NO | APPROVED_RETIREMENT |
| 23 | S | technician | Preserve technician | technician | NO | APPROVED |
| 29 | C | — | Retire legacy access; preserve User/history | NONE | NO | APPROVED_RETIREMENT |
| 30 | C+S | — | Retire legacy access; preserve User/history | NONE | NO | APPROVED_RETIREMENT |
| 31 | C+S | — | Retire legacy access; preserve User/history | NONE | NO | APPROVED_RETIREMENT |

## Final role/access decisions

User 15: `manager` → `supervisor`; future access is Siam only.  
User 16: `manager` → `supervisor`; future access is Chinatown only.

These are approved role reductions. `supervisor` is property-restricted, so
the approved property flags preserve property-specific access and avoid a
tenant-wide C+S over-grant.

## Prior User 16 decision context

Current role: `manager`  
Current legacy access: C  
Future access if manager remains: C+S

Resolved: the business approved Decision B with `supervisor` and an explicit
Chinatown-only property grant.

## How to approve

Edit `tenantless_property_role_mapping.csv` only after a human decision:

- Set `approved_role` to one canonical role.
- Set `approved_chinatown` and `approved_siam` to the intended explicit set.
- For tenant-wide roles, set both flags to `YES`; use `YES` for
  `approved_tenant_wide_expansion` when C+S expands legacy access.
- Set `approval_status` to `APPROVED`.

Rows left as `PENDING` or `MANUAL_REQUIRED`, invalid role values, access loss,
and unapproved expansion all block migration readiness. This package does not
authorize or perform any database writes.

## Approved legacy retirement

Users `1, 5, 12, 14, 17, 18, 21, 22, 29, 30, 31` have an approved decision of
`APPROVED_RETIREMENT`: future TenantMembership and property access are NONE;
their User records and historical references are preserved. During an approved
cutover, only applicable `Property.users` and `UserProfile.properties` legacy
access relations are to be retired. No user deletion is authorized.

Separate integrity notes retained: Inventory/Room mismatches: 8; unresolved
Job property inference: 1.
