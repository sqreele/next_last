# Property scope review — 2026-11-11

## Required policy

MaintenanceProcedure belongs to exactly one Property. Templates are private to
that Property, including their instructions and images. A user's active
TenantMembership grants determine which properties they can access. Staff status
or Django model permissions do not authorize another property's records.
Platform superusers retain global administration.

The owner FK is nullable solely to preserve legacy records whose owner cannot be
inferred. Normal API querysets hide these rows, admin forms require a Property,
and new Job/PM/plan associations reject them. They are not global templates.
An assigned template cannot change owner. Machine links must match that owner.

## Ownership migration

`0107_maintenanceprocedure_property` adds the owner and infers it from existing
machine links, Jobs (including trash), PM Jobs/machines and master-plan machines.
If usage spans properties, it creates one template per property and rewires each
relationship. Instructions, steps, timestamps and template-image records are
preserved. Image deletion retains files still referenced by another copied row.
Conflicting multi-property PM/plan records stop migration rather than guessing.
No production migration has been run as part of this change.

Read-only production preview: 25 existing templates, 3 additional copies needed,
11 templates without an inferable owner. Those 11 remain unassigned and hidden
until a platform administrator supplies an owner. Reversing the migration does
not merge copies, preserving subsequent edits and references.

## Changes and inspected operational models

| Models | Property source / enforcement |
| --- | --- |
| MaintenanceProcedure | Direct owner FK; scoped admin/API/services; required owner, immutable assignment; property-filtered machine choices; property and PM usage in exports |
| MaintenanceTaskImage | Parent template owner; scoped admin and template choices |
| Machine | Direct property; scoped admin; linked history prevents property changes; template reads and next-PM calculations require owner match |
| PreventiveMaintenance | Canonical Job or sole machine property; API/admin reject mismatched templates |
| PMMasterPlan | Sole machine property; admin/API validate machines, owner/template and assignee |
| MaintenanceChecklist, MaintenanceHistory, MaintenanceSchedule | Canonical parent PM scope in admin and choices |
| Property, Room, Area | Scoped admin lists, object lookup and operational choices; existing Room owner immutability preserved |
| Job, DeletedJob | Direct property plus Company technician assignment scope; template owner must match |
| JobImage, JobComment | Parent Job scope |
| UtilityConsumption, WorkspaceReport, InventoryUsage | Direct property scope in admin, lookup, exports and relationship inputs |
| Inventory | Existing property/category restrictions plus scoped room, Job and PM choices |
| InventoryCategory | Existing tenant restrictions preserved |

Create Job, PM forms, master-plan form, PM edit and template pages request
maintenance templates for the selected Property. API checks also enforce
ownership for forged IDs, independent of frontend filtering.

The canonical PM queryset moved from the view layer to `pm_access.py` so API,
serializers and admin reuse the same policy without importing views from models
or serializers. Its previous import location remains compatible.

## Other production observations

Read-only checks found zero PMs or master plans with multi-property machines,
zero active Job/machine property conflicts, and zero Inventory/Room property
conflicts. These are observations, not new database constraints.

## Validation and scope limits

Regression coverage includes migration splitting and idempotence, preserving
trashed Job references/images, hidden ownerless and foreign templates, forged
owner/machine/PM selections, template creation/duplication, inactive membership,
admin lists and choices, CSV export, property-filtered API endpoints and original
Job/PM recurrence and attachment flows.

Focused owned-template suite: 126 tests passed. Full backend run: 1,108 tests,
with one database statement timeout during an existing inventory test user-profile
setup. The final 60-test recheck, including the entire inventory authorization
module and latest property/migration/admin tests, passed. Frontend: all 66 test
files, TypeScript and lint passed (182 existing lint warnings). Migration dry
run found no unrecorded schema changes. `git diff --check` passed.

Model declarations and operational routes above were inspected. This is not a
completed security audit of identity, session, billing, demo or background
execution models, which have separate ownership and access rules.
