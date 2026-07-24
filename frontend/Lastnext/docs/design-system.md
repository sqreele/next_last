# HotelCare Pro design system

## Principles

The interface is calm, operational and scan-friendly. Color communicates
meaning, not decoration. Controls use familiar labels, clear focus states and
touch targets of at least 44px.

The visual-quality reference is Vercel Shop's restraint and interaction
discipline—not its commerce layout. Transferable principles are consistent
geometry, neutral canvases, sparse navigation, stable content regions,
immediate feedback and minimal motion. Hotel workflows retain higher
information density through progressive disclosure.

## Foundations

- **Typography:** Display 36/40, page title 30/36, section title 20/28, card
  title 16/24, body 16/24, body small 14/20, label 14/20 medium, caption 12/16.
  LINE Seed Sans Thai is the application font.
- **Spacing:** Base unit 4px. Page padding is 16px mobile, 24px tablet and 32px
  desktop. Sections use 24px gaps; cards use 16px mobile and 20px desktop.
- **Width:** Operational content can grow to 1504px. Tables and dashboards are
  not constrained to marketing-page widths.
- **Dimensions:** Buttons and default inputs are 44px high; large controls are
  48px. Icon buttons are 44px square. Inline icons are 16px, navigation icons
  are 20–24px, and badges are 24–32px high.
- **Radius:** 6px small, 8px controls, 12px cards, 16px dialogs. Badges are
  pills because their shape conveys compact metadata.
- **Borders:** One semantic border tone separates surfaces. Hover may increase
  border contrast but should not add decorative color.
- **Shadows:** Surfaces use a subtle 1px/2px shadow. Elevated overlays use a
  restrained 8px/24px shadow. Borders remain the primary separator.

## Semantic colors

Feature code should prefer Tailwind semantic classes: `bg-background`,
`bg-card`, `text-foreground`, `text-muted-foreground`, `border-border`,
`bg-primary`, `text-destructive`, `bg-success`, `bg-warning`, and `bg-info`.
The CSS variables in `globals.css` are the runtime source for light and dark
themes.

Status tones are centralized in `app/design-system/status-config.ts`.
Authoritative API values are preserved. `overdue`, `verified`, and other
presentation aliases are supported only as display values. Priority tones are
centralized separately so priority and workflow state do not compete.

## Layout

- `PageContainer` supplies responsive page padding, max width and mobile-nav
  clearance.
- `PageHeader` supplies a single page heading, optional description and
  responsive action placement.
- `SectionHeader` labels content regions without adding unnecessary cards.
- Desktop navigation groups Main, Property and Management destinations.
- The desktop sidebar collapses to icons; mobile uses Home, Jobs, Create, PM
  and More.
- Bottom navigation respects the device safe area and content includes enough
  bottom padding to remain reachable.

## Feedback

`FeedbackState` standardizes empty, no-result, error, unauthorized and offline
messages with an icon, heading, description, optional live-region behavior and
recovery action. `LoadingSkeleton` is used for stable content structures;
spinners are reserved for compact actions.

Skeleton dimensions must match final content dimensions so loading does not
shift surrounding layout. Avoid image-shaped placeholders on work-order cards
that do not show images in their resolved state.

## Operational cards

Work-order list cards show only location, problem summary, status, priority,
assigned technician and created/due time. IDs may appear as quiet reference
text. Topics, remarks, image galleries, audit history and other database fields
belong on the detail page or behind an explicit disclosure. Destructive and
editing actions are secondary; the primary card action opens the job.

## Mobile rules

- No page should cause viewport-level horizontal overflow at 320px.
- Convert data tables to cards/lists or reduce columns before allowing
  horizontal scrolling.
- Place primary form actions in reach; use a safe-area-aware sticky action bar
  for long forms.
- Labels stay visible; icon-only actions require an accessible name.
- Motion is optional and disabled when reduced motion is requested.
