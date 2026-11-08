# Mobile browser audit — 2026-11-08

**Complete: 87/87 URLs passed**, covering 79 page templates. Completed passes include 9 intentional redirects and 348 viewport checks. The concrete marketing URLs are included alongside the dynamic route templates.

## Method and limits

- Chromium mobile/touch emulation at 320×844, 375×844, 390×844, and 768×1024.
- Use one URL per local dev-server session by default to bound memory; marketing variants sharing a template ran in batches of four.
- Copy application code to `/tmp/staymaint-mobile-batches/site`; replace only the copied server session transport with a synthetic local session. This session override exists only in the isolated copy; the path-matching fix listed below is the production code change.
- Both browser and server API calls use synthetic fixtures on localhost. Writes are rejected; the invitation-preview POST is a read-only fixture. External requests are blocked in the browser.
- Wait for content and the intended redirect destination. Loading states, unintended error boundaries, unexpected redirects, and browser exceptions cannot pass. Dedicated error/access-denied pages are checked in their intended state.
- Check document/main horizontal overflow, content outside viewport bounds, and mobile editing fonts. Wide tables/floor plans may scroll inside their own containers.
- Capture a screenshot for every successful viewport observation. A redirect pass verifies its trigger and destination, not a separately rendered page.
- This verifies the responsive layout with fixture data. It does not verify real tenant data, production authentication, payment processing, physical-device Safari, or the iOS keyboard.

## Fixes found by this browser run

1. Jobs Report: shared mobile headers combined `width: 100%` with side margins and overflowed their parent by 12px. Use automatic width so the gutters fit.
2. Machine detail: a long equipment name expanded a flex child at 768px. Allow the flex children to shrink and wrap unbroken names.
3. Demo job/machine details: wrap unbroken remarks and descriptions to prevent overflow at 320px.
4. Jobs by Topic and Rooms by Topic: use the server data transport for property loading; the browser API helper used a relative URL during SSR.
5. Demo Report: record the update timestamp only after data loads so SSR and initial hydration render the same placeholder.
6. Public PM marketing page: match protected paths by segment boundary, so `/preventive-maintenance-hotel` stays public. Browser requests without cookies still receive a Dashboard login redirect (307) and Jobs API denial (401).

## Per-URL results

| # | URL | Result | Viewports |
| --- | --- | --- | --- |
| 0 | `/hotel-maintenance-software` | Passed | 4 |
| 1 | `/th/%E0%B8%A3%E0%B8%B0%E0%B8%9A%E0%B8%9A%E0%B9%81%E0%B8%88%E0%B9%89%E0%B8%87%E0%B8%8B%E0%B9%88%E0%B8%AD%E0%B8%A1%E0%B9%82%E0%B8%A3%E0%B8%87%E0%B9%81%E0%B8%A3%E0%B8%A1` | Passed | 4 |
| 2 | `/ai-chat` | Passed | 4 |
| 3 | `/auth/access-pending` | Passed | 4 |
| 4 | `/auth/error` | Passed | 4 |
| 5 | `/auth/forgot-password` | Passed | 4 |
| 6 | `/auth/login` | Passed | 4 |
| 7 | `/auth/logout` | Passed redirect | 4 |
| 8 | `/auth/onboarding` | Passed redirect | 4 |
| 9 | `/auth/register` | Passed | 4 |
| 10 | `/auth/reset-password` | Passed | 4 |
| 11 | `/auth/signin` | Passed redirect | 4 |
| 12 | `/contact` | Passed | 4 |
| 13 | `/dashboard/Preventive_maintenance` | Passed redirect | 4 |
| 14 | `/dashboard/areas` | Passed | 4 |
| 15 | `/dashboard/billing` | Passed redirect | 4 |
| 16 | `/dashboard/chartdashboad` | Passed redirect | 4 |
| 17 | `/dashboard/chartdashboard` | Passed | 4 |
| 18 | `/dashboard/create-job` | Passed | 4 |
| 19 | `/dashboard/createJob` | Passed redirect | 4 |
| 20 | `/dashboard/floor-plan` | Passed | 4 |
| 21 | `/dashboard/inventory` | Passed | 4 |
| 22 | `/dashboard/jobs/JOB-001/edit` | Passed | 4 |
| 23 | `/dashboard/jobs/JOB-001` | Passed | 4 |
| 24 | `/dashboard/jobs/JOB-001/print` | Passed | 4 |
| 25 | `/dashboard/jobs/by-area` | Passed | 4 |
| 26 | `/dashboard/jobs/by-topic` | Passed | 4 |
| 27 | `/dashboard/jobs` | Passed | 4 |
| 28 | `/dashboard/jobs-report` | Passed | 4 |
| 29 | `/dashboard/machines/MC-001` | Passed | 4 |
| 30 | `/dashboard/machines` | Passed | 4 |
| 31 | `/dashboard/maintenance-tasks/1` | Passed | 4 |
| 32 | `/dashboard/maintenance-tasks/create` | Passed | 4 |
| 33 | `/dashboard/maintenance-tasks` | Passed | 4 |
| 34 | `/dashboard/my-jobs` | Passed | 4 |
| 35 | `/dashboard/myJobs` | Passed redirect | 4 |
| 36 | `/dashboard` | Passed | 4 |
| 37 | `/dashboard/preventive-maintenance/PM-001` | Passed | 4 |
| 38 | `/dashboard/preventive-maintenance/create` | Passed | 4 |
| 39 | `/dashboard/preventive-maintenance/dashboard` | Passed | 4 |
| 40 | `/dashboard/preventive-maintenance/edit/PM-001` | Passed | 4 |
| 41 | `/dashboard/preventive-maintenance` | Passed | 4 |
| 42 | `/dashboard/preventive-maintenance/plans/PLAN-001/edit` | Passed | 4 |
| 43 | `/dashboard/preventive-maintenance/plans/create` | Passed | 4 |
| 44 | `/dashboard/preventive-maintenance/plans` | Passed | 4 |
| 45 | `/dashboard/preventive-maintenance/schedule` | Passed | 4 |
| 46 | `/dashboard/profile/edit/me` | Passed | 4 |
| 47 | `/dashboard/profile` | Passed | 4 |
| 48 | `/dashboard/properties` | Passed | 4 |
| 49 | `/dashboard/rooms/101` | Passed | 4 |
| 50 | `/dashboard/rooms/by-topics` | Passed | 4 |
| 51 | `/dashboard/rooms` | Passed | 4 |
| 52 | `/dashboard/rooms/topic-mismatch` | Passed | 4 |
| 53 | `/dashboard/search` | Passed | 4 |
| 54 | `/dashboard/settings/billing` | Passed | 4 |
| 55 | `/dashboard/settings/billing/success` | Passed | 4 |
| 56 | `/dashboard/settings/users` | Passed | 4 |
| 57 | `/dashboard/unauthorized` | Passed | 4 |
| 58 | `/dashboard/utility-consumption` | Passed | 4 |
| 59 | `/demo/create-job` | Passed | 4 |
| 60 | `/demo/email-reports` | Passed | 4 |
| 61 | `/demo/jobs/DEMO-001` | Passed | 4 |
| 62 | `/demo/jobs` | Passed | 4 |
| 63 | `/demo/my-jobs` | Passed | 4 |
| 64 | `/demo` | Passed | 4 |
| 65 | `/demo/report` | Passed | 4 |
| 66 | `/demo/rooms` | Passed | 4 |
| 67 | `/invitations/accept` | Passed | 4 |
| 68 | `/login` | Passed redirect | 4 |
| 69 | `/offline` | Passed | 4 |
| 70 | `/` | Passed | 4 |
| 71 | `/platform` | Passed | 4 |
| 72 | `/platform/subscriptions` | Passed | 4 |
| 73 | `/platform/tenants/1` | Passed | 4 |
| 74 | `/platform/tenants` | Passed | 4 |
| 75 | `/platform/usage` | Passed | 4 |
| 76 | `/platform/webhook-events` | Passed | 4 |
| 77 | `/pricing` | Passed | 4 |
| 78 | `/report/MOBILE/101` | Passed | 4 |
| 79 | `/hotel-engineering-management` | Passed | 4 |
| 80 | `/preventive-maintenance-hotel` | Passed | 4 |
| 81 | `/hotel-work-order-system` | Passed | 4 |
| 82 | `/hotel-cmms` | Passed | 4 |
| 83 | `/hotel-asset-management` | Passed | 4 |
| 84 | `/hotel-maintenance-checklist` | Passed | 4 |
| 85 | `/hotel-engineering-report` | Passed | 4 |
| 86 | `/th/%E0%B8%A3%E0%B8%B0%E0%B8%9A%E0%B8%9A%E0%B8%9A%E0%B8%A3%E0%B8%B4%E0%B8%AB%E0%B8%B2%E0%B8%A3%E0%B8%87%E0%B8%B2%E0%B8%99%E0%B8%8B%E0%B9%88%E0%B8%AD%E0%B8%A1%E0%B8%9A%E0%B8%B3%E0%B8%A3%E0%B8%B8%E0%B8%87%E0%B9%82%E0%B8%A3%E0%B8%87%E0%B9%81%E0%B8%A3%E0%B8%A1` | Passed | 4 |

## Evidence

Screenshots and full per-page JSON: `/tmp/staymaint-mobile-batches/results/`. The checked-in summary JSON contains the final status, headings, and viewport measurements for each URL. Batch/server logs remain in `/tmp/staymaint-mobile-batches/`.

## Repeat or resume

```bash
npm install --prefix /tmp/staymaint-mobile-audit playwright
PLAYWRIGHT_BROWSERS_PATH=/tmp/staymaint-mobile-audit/browsers /tmp/staymaint-mobile-audit/node_modules/.bin/playwright install --with-deps chromium
cd frontend/Lastnext
node scripts/audit-mobile.cjs
# Rerun selected URL indices from the table:
AUDIT_INDICES=28,29 node scripts/audit-mobile.cjs
```

The default is one page per dev-server session. Completed passes are skipped on resume only for the same application/fixture fingerprint; failed or pending pages are retried. Changing application code or fixtures archives the old evidence and requires a fresh run. Use `AUDIT_BATCH_SIZE` only when more memory is available. `MOBILE_AUDIT_ROOT` changes the isolated output directory. No fixture server or auth stub belongs in a deployment.

## Final validation

- `npm run typecheck` — passed.
- `npm test` — 55 test files passed, zero failures.
- `git diff --check` — passed.
- Fixture contract and JavaScript/Python syntax checks — passed.
