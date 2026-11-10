# Project cleanup audit

Date: 2026-11-10. Branch: `room-property-canonicalization-live`.

This records the original structural audit and baseline, followed by the cleanup
implementation below. It is not an exhaustive correctness, security, performance,
or unused-code audit. The initial audit did not change application behavior.
The working tree already contained demo-related changes; those were included in
the observed frontend baseline and have not been edited by this audit.

## Baseline

| Check | Result |
| --- | --- |
| Frontend `npm run typecheck -- --incremental false` | Passed |
| Frontend `npm run lint` | 0 errors, 315 warnings in 58 files |
| Frontend `npm test` | 59 runner-reported tests passed, 0 failed |
| Python AST syntax scan of `src/myappLubd` | No syntax errors |
| Backend full test suite | Not run for this audit |
| Production build / browser tests | Not run for this audit |

Lint breakdown: 248 explicit `any`, 30 unused-variable warnings, 17 React Hook
dependency warnings, 17 image-element warnings, and 3 missing-alt warnings.
The test count is the Node runner's reported count; some files run as file-level
tests, so this does not measure assertion count or behavioral coverage.

The structural scan covered 282 Python files / 67,086 lines under
`backend/myLubd/src/myappLubd` and 477 TS/TSX/MJS files / 78,239 lines under
`frontend/Lastnext/app`. These counts include tests and migrations where present;
file size alone is not evidence of a bug.

## Findings and priorities

### 1. Give the two UserSerializer classes distinct responsibilities — high

`backend/myLubd/src/myappLubd/serializers.py:186` defines a public/basic
`UserSerializer`; line 1524 defines another `UserSerializer` for user writes.
The later class replaces the module-level name, so external imports resolve to
the later class. Earlier references evaluated during import may retain the first.
This is a concrete ambiguity; it does not by itself prove an authorization bug.

Before renaming, inventory imports, nested serializers and ViewSet actions.
Add or retain contract checks for user reads, creation, update and password
handling, then use explicit read/write names with compatibility where required.

### 2. Establish one backend dependency source — high

Docker and CI install `backend/myLubd/requirements.txt`, while
`backend/myLubd/src/requirements.txt` contains a different dependency set and
versions, including Django 4.2.16 versus the outer file's >=4.2,<5.0 range.
The inner file repeats django-dbbackup and includes test and push dependencies
not listed in the outer file. The outer file repeats Pillow. A clean install
can therefore depend on which file a developer chooses.

Choose and document the runtime source; separate development/test dependencies
if needed. Check optional feature imports before removing either list. Lock or
constrain resolved versions in a separate change from business-code refactors.
Verify a fresh Docker build and CI install use the intended dependency set.

### 3. Reduce frontend type and Hook debt by feature — high

Start with `app/lib/PreventiveMaintenanceService.ts` (35 lint warnings),
`app/lib/api/jobsApi.ts` (27), and `app/lib/data.server.ts` (24).
Use concrete API response types and `unknown` plus validation at uncertain
boundaries. Do not replace `any` with assertions merely to silence warnings.

Review Hook warnings as behavior changes: for example,
`PreventiveMaintenanceForm.tsx:370` captures `error` without listing it as a
dependency; `dashboard/inventory/page.tsx:264` omits `fetchInventory`.
Check re-fetching, cancellation and stale responses rather than blindly adding
dependencies. Nine Hook warnings occur in PreventiveMaintenanceForm.

### 4. Extract responsibilities from large modules — medium, staged

| Module | Lines | Suggested first boundary |
| --- | ---: | --- |
| Backend views.py | 8,474 | One domain's ViewSets and query helpers |
| Backend admin.py | 7,100 | PDF/report exports, then domain admin modules |
| Backend models.py | 4,012 | Only after import and migration dependencies are mapped |
| Backend serializers.py | 3,857 | Read/write serializers grouped by domain |
| Frontend JobsReport.tsx | 2,857 | Report data preparation versus PDF/table rendering |
| Frontend PreventiveMaintenanceForm.tsx | 2,394 | Validation, requests and form sections |
| Frontend CreateJobForm.tsx | 2,314 | Submission flow and independent form sections |
| Frontend inventory/page.tsx | 2,052 | Data hook, filters, table and dialogs |

Backend `admin.py:1644` contains a 518-line `export_jobs_pdf` function.
Keep routes, response fields, permission checks, transaction boundaries and
Django model app labels stable while extracting. Moving models is a later task,
not the first cleanup step. The 2,572-line translation dictionary is data and has
lower priority than mixed rendering/business logic.

### 5. Consolidate proven duplication and clarify request layers — medium

An AST comparison found identical `_floor_from_room_name` bodies in
`views.py:3614` and `admin.py:1171`; this is a concrete candidate for a shared
helper with edge-case tests.

Frontend has several request layers (`api-client.ts`, `backend-fetch.ts`,
`data.server.ts`, and domain services). Their existence alone does not prove
duplication: server session forwarding and browser requests have different
requirements. Map callers, then share only equivalent error parsing, timeout
and retry behavior. Preserve authentication, tenant/property scope, uploads
and cache invalidation.

### 6. Make error handling and logs consistent — medium

The backend AST scan found 144 bare/Exception/BaseException catch handlers,
excluding migrations. This is an inventory, not 144 confirmed defects.
Review handlers that return success/default data or obscure failures first.
Use specific exceptions where possible and preserve intentional provider-error
boundaries. PreventiveMaintenanceService has repeated console.error handling;
centralize common policy while preserving useful context and avoiding tokens
or sensitive request payloads in logs.

### 7. Align tooling, tests and generated assets — medium/low

- Both `.eslintrc.json` and `eslint.config.mjs` exist. Consolidate the intended
  configuration after checking editor and CLI behavior.
- CI already runs frontend typecheck/lint/tests/build, browser fixtures and
  selected backend regression modules. Extend these checks rather than creating
  a second pipeline. Backend Ruff/format checks are not currently in CI.
- Current lint success allows warnings. Introduce a warning baseline or scoped
  no-new-warning policy before eventually enforcing zero warnings.
- Some frontend tests match source strings (for example
  `tests/ux-regressions.test.mjs`). Keep useful contract checks, and add behavior
  or browser coverage for the workflows being refactored. Avoid mass snapshots
  or tests that merely repeat implementation details.
- Git tracks 170 files under `backend/static_volume`. Confirm collectstatic,
  font sources and deployment mounts before removing generated assets.
- `scripts/deploy.sh` pulls `main` although this working branch has another
  name; its displayed URLs also use the legacy domain. Clarify the intended
  deployment branch and update operator instructions in a separate change.

## Recommended delivery sequence

1. Record the baseline, define one lint config and dependency policy, and keep
   existing uncommitted demo work isolated from cleanup commits.
2. Resolve serializer naming, consolidate the proven floor helper duplication,
   and remove confirmed unused imports/variables in small reviewed commits.
3. Type the Jobs and preventive-maintenance API boundaries, then review Hook
   warnings with focused workflow checks.
4. Extract one frontend form/report and one backend domain at a time. Preserve
   compatibility imports where needed and run affected regression modules.
5. Consolidate PDF/report utilities and logging once equivalent behavior is
   demonstrated; clean generated assets only after a clean build/deploy check.

Each refactor should state the behavior being preserved, pass type/lint and
affected tests, and have an independently reversible commit. Authentication,
tenant/property permissions, billing, migrations and notification delivery need
their existing focused regressions whenever touched. Runtime upgrades, database
schema redesign and business-rule changes should be separate work items.

Completion means the changed areas have explicit contracts and readable
boundaries, warnings do not grow, clean installs are reproducible, and affected
user workflows still pass. A lower line count alone is not the goal.

## Cleanup implementation

Implemented in the follow-up working-tree changes:

- Renamed the basic/public and write serializers to `UserReadSerializer` and
  `UserWriteSerializer`. Existing `UserSerializer` imports retain their historical
  write behavior through an alias. Current ViewSet and registration callers use
  the explicit write name; the nested maintenance response shape is preserved.
- Extracted the Room API to `room_views.py`, preserving the import from `views`
  used by routers. Admin and API floor choices share `room_names.py`.
- Consolidated backend runtime requirements in the outer `requirements.txt`,
  removed the duplicate Pillow entry, and retained the Web Push dependencies
  previously present only in the inner file. Development/pytest requirements
  extend the runtime file; `src/requirements.txt` is a compatibility include.
  `pip install --dry-run -r /project/src/requirements.txt` resolved successfully
  with the complete backend directory mounted into an isolated container.
- Removed `.eslintrc.json`; the flat config is the single ESLint configuration.
  Explicitly unused legacy arguments and intentional rest omissions follow a
  documented naming/configuration convention. `npm run lint` caps warnings at
  184 to prevent the total from increasing.
- Typed Jobs API responses, separate typed caches and streaming-event contracts;
  replaced `any` in the server data-access layer and preventive-maintenance
  service with domain types or `unknown` and checks. The maintenance create
  response accepts validated record/envelope/paginated shapes.
- Fixed JSON serialization for Jobs writes, automatic multipart boundaries,
  successful 204 deletion handling, and timeout cleanup. Added behavioral
  request/cache tests; the disabled streaming API remains inert.
- Extracted report filtering, timezone grouping and comparison calculations into
  `jobs-report-data.ts` with focused behavior tests.
- Moved maintenance field-sync effects out of the Formik render callback into
  `MaintenanceFormSync`, with shared form types and tests for active property,
  preselected machine, edit mode and selected-template authority.
- Stabilized Inventory and Machine request callbacks, preserving abort signals
  and request-generation guards. Inventory reads its settled-content state from
  a ref to avoid making successful loads trigger a dependency-driven refetch.
- Removed confirmed unused code and empty debug blocks. Fixed Hook dependencies;
  lint now reports zero unused-variable and zero Hook-dependency warnings.
  Maintenance service error logging uses the shared logger, and errors are
  narrowed before accessing their status/details.
- Consolidated duplicate image-URL compatibility helpers. Deployment uses a
  clean branch checkout and fast-forward pull, supports `DEPLOY_BRANCH`, and
  displays the configured/current domain. The script was syntax-checked only.

### Test-suite repairs found during validation

The initial full backend run found four failures and twelve errors. An isolated
copy with the original HEAD versions of `views.py`, `admin.py` and `serializers.py`
reproduced the same failures/errors in the affected modules. Unrelated existing
demo changes were retained in this comparison.

- A Job document test called `close()` after consuming the test client's
  self-closing streaming iterator. The second close could close the database
  connection inside APITestCase's transaction and cascade into later tests.
  Removed the redundant close; bytes/access/storage assertions remain.
- Two reassignment assertions expected 403 even though inaccessible Jobs are
  scoped out with 404. Tests now also verify the assignee remains unchanged.
- Subscription-admin recovery permits editing but deliberately prohibits deleting
  billing history. The older superuser assertion now checks that policy.
- Membership transfers are rejected by validation before quota evaluation. The
  test now asserts that rejection and unchanged source membership.

These repairs preserve application authorization behavior rather than weakening
it to satisfy outdated assertions.

### Final validation

| Check | Result |
| --- | --- |
| Backend full app suite | 1,065 tests passed |
| Frontend full suite | 62 runner-reported tests passed |
| TypeScript check | Passed |
| ESLint warning budget | Passed: 0 errors, 184 warnings, down from 315 |
| Production frontend build | Passed, including a final cached build after source edits |
| Backend image build | Passed |
| Fresh image `python -m pip check` | No broken requirements |
| Fresh image `python manage.py check` | No issues |
| Python AST syntax scan, shell syntax, `git diff --check` | Passed |

The final backend run used the dedicated `test_project_cleanup` database and
overrode `PASSWORD_HASHERS` with Django's MD5 hasher only inside the one-off test
runner to reduce runtime (249.525 seconds). Application settings and production
password hashing were not changed. The initial full run used the normal hasher;
the isolated pre-cleanup comparison reproduced the old suite defects described
above. CI now includes the user serializer contracts and repaired backend modules.

Browser end-to-end tests and a production deployment were not performed. The
Formik synchronization, API request/cache behavior, and extracted report logic
were covered with focused tests in addition to the full frontend suite.

### Remaining work

The warning budget still contains 164 explicit-any, 17 image-element and 3
alt-text warnings. Further typing needs concrete contracts in the remaining
screens; the image warnings need caller/layout review. Larger admin exports,
models and serializer modules still need incremental domain extraction. The
144 broad exception handlers have not been mass-rewritten, and tracked static
assets have not been removed without a deployment/asset ownership audit.

The existing uncommitted demo changes remain separate from these cleanup edits.
No production deployment was performed for this follow-up.
