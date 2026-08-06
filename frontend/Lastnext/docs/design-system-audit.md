# Design system and app shell audit

Audit date: 2026-07-24

## Completion status

The application-wide migration is complete for the current route inventory:

- All 38 authenticated dashboard pages inherit the canonical app shell,
  responsive page geometry and safe-area behavior.
- All dashboard and shared TSX surfaces now use semantic neutral colors rather
  than direct white/slate/gray presentation utilities. Print-only work-order
  output is intentionally excluded so paper and PDF rendering remain white.
- Surface radii and elevation have been normalized to the documented card and
  overlay levels.
- Shared button, input, textarea, select, card, badge and table primitives use
  predictable dimensions, focus behavior and disabled states.
- Route-level loading uses dimensionally stable skeletons. Compact spinners
  remain only for in-place actions such as submit, refresh, upload and sync.
- The canonical work-order card exposes only operational scan fields; secondary
  database details remain on detail or disclosed views.
- HotelCare Pro naming and `hotelcarepro.com` production-domain references are
  applied across frontend, backend configuration and deployment files.
- TypeScript validation and the production build pass for all 62 generated
  application routes.

## Current architecture

- Next.js 15.5 App Router with React 18.3 and strict TypeScript.
- Routes live under `app/`; the authenticated product is nested below
  `app/dashboard/layout.tsx`.
- Tailwind CSS 3.4 is paired with Radix-based, Shadcn-style primitives in
  `app/components/ui`.
- Lucide is the primary icon library. Recharts, SWR, Zustand, Formik, Yup and
  PWA/offline helpers are present.
- The root layout owns theme, locale, authentication, property access, store,
  SWR, toast, service-worker and network-status providers.
- The dashboard layout owns desktop sidebar, desktop/mobile headers, mobile
  drawer, bottom navigation, pull-to-refresh and page transitions.
- A class-based light/dark theme is bootstrapped before hydration.

## Findings by priority

### Resolved critical findings

- `globals.css` contains historical component layers. A documented canonical
  final layer now resolves them to one token contract without the regression
  risk of deleting legacy selectors in the same migration.
- Dark mode relies partly on global overrides of direct color utilities,
  including `!important`, instead of feature components consuming semantic
  tokens.

### Resolved high-priority findings

- Neutral presentation colors in dashboard and shared components have been
  migrated to semantic utilities. Direct colors remain where they encode
  status, priority, chart series, destructive feedback or print output.
- Status presentation was split between CSS variables, component-local maps
  and feature-specific classes. Priority mapping lived in a shared component
  rather than a typed configuration module.
- Navigation data was duplicated into primary and dashboard arrays without
  grouping. The mobile bar exposed six equal-weight actions and omitted the
  preventive-maintenance route.
- Shell concerns were implemented in one large client layout. This increases
  review risk and makes reuse/testing harder.
- Several live routes have legacy aliases (`createJob`/`create-job`,
  `myJobs`/`my-jobs`, and two chart-dashboard spellings). Removing aliases
  could break bookmarks or links.

### Medium priority

- Typography includes arbitrary sizes and weights across operational pages.
  Page headers and cards have competing implementations.
- Radius values range from compact controls to 30–36px cards and pill-shaped
  inputs. Shadows range from subtle borders to large colored shadows.
- Loading coverage is good for major dashboard routes, but empty/error/no
  results/permission states do not share one accessible contract.
- Breadcrumb labels are generated from URL fragments and can expose slugs
  rather than clear page names.
- Many components are client components. Some are justified by forms and
  interaction, but page-level client boundaries should be reviewed over time.

### Low priority

- English strings coexist with an i18n dictionary.
- Native `title` tooltips are used for some collapsed navigation controls.
- Decorative pulse and transform effects should honor reduced-motion.

## Accessibility and responsive issues

- Several icon-only controls use `title` without a durable accessible name.
- Focus styling is inconsistent between semantic tokens and direct blue rings.
- Some status summaries rely heavily on hue, although the shared badge also
  includes text and a dot.
- The prior mobile navigation was crowded and did not provide a deliberate
  secondary-navigation destination.
- Wide operational screens use both responsive cards and horizontal tables;
  remaining tables need page-by-page validation at 320px width.
- The global skip link targets a nested main landmark, while the root and
  dashboard previously produced multiple main landmarks.

## Existing strengths

- Authentication, property access and API boundaries are clearly separated
  from presentation.
- Safe-area helpers, 44px touch targets, offline detection, service-worker
  setup, loading routes and image helpers already exist.
- Radix primitives provide dialog focus management and keyboard behavior.
- Theme bootstrap avoids a first-render theme flash.
- Backend job statuses and priorities are explicit and stable.

## Breaking-change risks

- Do not rename backend values: `pending`, `in_progress`,
  `waiting_sparepart`, `completed`, `cancelled`; priorities are `low`,
  `medium`, `high`.
- `overdue` is a derived UI state and must not be sent as a Job status.
- Preserve legacy route aliases until redirects and analytics confirm they are
  unused.
- Keep authentication, property filtering, pull-to-refresh and offline
  behavior intact while extracting shell components.
- Consolidate the large global stylesheet in small, visual-regression-tested
  passes rather than deleting old blocks in one change.
