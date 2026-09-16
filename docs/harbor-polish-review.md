# Harbor polish and Budget consistency sweep

## Delivered

- Harbor home-screen manifest and Apple metadata, standalone display, navy theme/background (#1B3A5C), and 180/192/512 PNG icons derived from the existing SVG branding. The original logo is unchanged; the dedicated square icon keeps generous padding. Manifest and icons are public through middleware. Uses the Next.js metadata conventions: https://nextjs.org/docs/app/api-reference/functions/generate-metadata and https://nextjs.org/docs/app/api-reference/file-conventions/metadata/manifest.
- Persistent mobile Budget / Dock / Fleet / Settings navigation with labels, current-page semantics, safe-area padding and matching content clearance. Desktop tabs include Fleet. The follow-up mobile pass removes the account menu; Sign Out and Feedback now live in Settings.
- Fleet owns the existing card balance, statement, payment and configuration UI at `/fleet`. Settings retains Ripples, Waves and Charts. Both routes use the extracted SettingsWorkspace and the existing repositories; no duplicate store. Old `/settings#fleet` links redirect to Fleet.
- Budget action rules are centralized in budget-actions.ts and used by the shared ChartRows renderer. Edit/Skip apply across checking and card-funded spending plans. Zero-dollar adjustments remain visible and editable. Skipped rows offer Restore. Occurrence edits do not alter definitions or later periods.
- Summary metrics now consume saved occurrence adjustments, skipped states and completed amounts. Overspending remains negative instead of being clamped to zero. Existing spend logs take precedence over Done states to prevent double counting.
- Spending history is collapsed until opened; existing collapsed Budget categories/weeks, Dock weeks and Fleet cards remain compact. Removed the repeated Dock checking update action. Shared boat/anchor loading indicator includes status text and reduced-motion support.
- Settings/Fleet settings updates are displayed after persistence succeeds; action failures show an error instead of silently leaving an unsaved settings snapshot on screen.

## Budget action matrix reviewed

| Concept | Edit occurrence | Skip / Restore | Record actual | Done | Delete |
| --- | --- | --- | --- | --- | --- |
| Weekly allowance, checking | Yes | Before actual activity | Log Spend | Before actual activity | Definition in Settings; mistaken log in Budget |
| Weekly allowance, card | Yes | Before actual activity | Log Spend | Recording a card purchase requires Log Spend | Same |
| Monthly allowance, checking/card | Same payment-specific rules | Same | Same | Same | Same |
| Scheduled expense, checking/card | Same payment-specific rules | Same | Same | Same | Same |
| Recurring, one-time, manually created, legacy-inferred spending plans | Shared controls above | Same persisted period scope | Same | Same | Same |
| Income / Waves | Configuration in Settings; occurrence actions in Dock | Dock | Dock receipt / Done | Dock | Settings definition; one-time Dock events retain existing behavior |
| Credit-card payments / statements | Fleet schedule / Dock occurrence | Existing Dock payment actions | Fleet payment state | Fleet / Dock | Fleet statement/payment management |

Actual card purchases are recorded through Log Spend so Fleet receives their amount and purchase date. Done remains the existing checking completion operation. Skip and Done are unavailable once an actual spend is recorded; remove a mistaken log before skipping an occurrence. Skip is never a substitute for deleting a recurring definition. A Budget link exposes full definition editing/deletion in Settings.

Explicit weekly/monthly allowances now take precedence over legacy category/name heuristics. For example, a manually configured allowance in the Credit Cards category remains an allowance. Legacy payment definitions are excluded from spending rows, matching the existing domain summary and preventing duplicate purchase logging; card payments have their own Fleet destination.

## Files/components

- app/layout.tsx, app/manifest.ts, middleware.ts, app/globals.css
- app/components/NavBar.tsx, HarborLoading.tsx, SettingsWorkspace.tsx
- app/fleet/page.tsx, app/settings/page.tsx
- app/budget/page.tsx, app/dock/page.tsx
- app/lib/budget-actions.ts, harbor-domain.ts, ripple-type.ts
- public/harbor-app-icon.svg, apple-touch-icon.png, harbor-icon-192.png, harbor-icon-512.png
- scripts/verify-harbor-polish.cjs

No database/schema changes, dependency changes, or new persistence models. db/0016_allow_six_calendar_weeks.sql is untouched.

## Verification

- `node scripts/verify-harbor-polish.cjs`: 30 passing checks. Exercises production domain functions and local repositories with synthetic storage: action matrix, category independence, edit/zero amount, skip/restore, future weeks/months, Done, logging/deleting spend, card payment forecasts, balance/statement/payment saves and fresh reads, six-week month, plus the existing production forecast scenarios.
- `npx tsc --noEmit` and `npm run lint` passed.
- Production build passed with network access for the existing Geist Google font. The restricted-network build cannot fetch that font. Existing Next.js middleware deprecation warning remains.
- HTTP smoke checks confirmed the public manifest and PNG icons return successfully without authentication. Inspected rendered web-app title/status-bar, touch-icon and viewport metadata.
- Visually inspected the generated 512px icon for centered branding and safe area.
- No live financial data was changed. Repository fresh-read checks simulate persistence reload; they are not authenticated browser navigation/reload tests.

## Remaining verification and separate follow-ups

- Actual iPhone Add to Home Screen, Safari safe areas/keyboard interaction, mobile and desktop interactive layout, and authenticated Budget > Dock > Fleet > Settings navigation/refresh require a browser/device session. These have not been claimed as tested.
- Live Supabase writes and failures were not exercised; the existing repository calls, conflict keys and schema are preserved.
- The existing occurrence key is month + week + item + kind. Multiple scheduled occurrences of the same definition in one week are still handled as a weekly group. Supporting per-date actions would require a separate model change.
- Existing week-wrap acknowledgments (Leave It / overspend acknowledgment) use local UI state; only the save-transfer path persists a cash event. This pre-existing limitation is outside this pass's occurrence-action changes.
- Existing legacy category/name inference remains for definitions without an explicit allowance type. Broad migration/normalization, service-worker/offline transaction queues, middleware-to-proxy migration and font self-hosting are separate tasks.


## Follow-up: focused mobile interactions

- NavBar: removed the hamburger and its dropdown/state/listeners; compact 56px mobile identity bar. Existing bottom destinations, active styling, safe-area CSS and desktop tabs remain. Fleet's navigation icon now matches its peers at 16px with rounded 2px strokes.
- AccountActions: shared inline-SVG Feedback and Sign Out icons and matching desktop controls. Settings uses full-width 56px rows under Harbor & Account. Feedback dispatches the existing dialog event; Sign Out submits the existing POST form. No authentication or submission logic changed.
- DisclosureHeader: a full-summary native button with aria-expanded, descriptive expand/collapse labels, keyboard activation and visible focus. Its chevron has no button chrome. The header alone handles toggling; actions/forms/content are siblings outside the toggle target.
- Inherited by Budget week summaries and category groups, Dock timeline weeks, Fleet card summaries and Settings Ripple category groups. Budget week headers can also close an open inline form. Wrap Week stays independent. Spending Log's native summary now includes the full padded summary area.
- Icon container sweep: squared the help icon and feedback success icon containers to Harbor's rounded-square treatment. Existing status badges and consistent icon shapes were retained.
- Checks passed: TypeScript, ESLint, production build, git diff whitespace check, and direct shared-component rendering/callback checks for Feedback dispatch, Sign Out POST, matching account styles, full-header button coverage and aria-expanded state. No financial logic, schema, PWA configuration or bottom-navigation destinations changed in this follow-up.
- Browser/device limitation: no authenticated mobile/desktop browser session or physical iPhone was exercised. Actual feedback submission/sign-out, touch behavior and safe-area rendering still need a live browser/device smoke check; component checks confirm wiring and markup rather than those end-to-end flows.


## Follow-up: iPhone keyboards, focus zoom and Safari icons

### Financial inputs

Added FinancialInput, a native input wrapper that defaults to inputMode="decimal" and forwards every existing prop, ref, value, handler and constraint. Nineteen financial input sites now use it across Budget, Dock, Setup, BudgetItemManager, HarborSpreadsheetDock, CreditCardSummaryPanel, ScheduleCardPaymentForm, and SettingsWorkspace (including its MoneyInput used for allowances, expenses and income). Date/recurrence integer fields use inputMode="numeric". No number/text types, parsing, save handlers, persistence calls or negative-value constraints were changed.

### Focus zoom

The existing .field class uses 0.875rem (14px), and many inline inputs/selects/textareas use text-sm. That is a focus-zoom risk on iOS. A shared unlayered CSS rule now sets only form controls to max(16px, 1rem) on narrow screens or coarse-pointer devices, including landscape phones. It overrides the smaller utility/.field fonts while leaving desktop typography and non-control text alone. The viewport still permits intentional pinch zoom; no maximum-scale or user-scalable restriction was added.

### Active icon sources

| URL/source | Purpose |
| --- | --- |
| /favicon.ico (app/favicon.ico) | Harbor ICO containing 16, 32 and 48px images. Next.js automatically emits the rel=icon link with a content-hashed query. |
| /favicon.svg | Explicit SVG favicon, replaced with the existing square Harbor artwork. |
| /harbor-favicon-32.png | Explicit 32px PNG favicon. |
| /harbor-favicon-48.png | Explicit 48px PNG favicon. |
| /apple-touch-icon.png | Existing 180px Apple home-screen icon, unchanged. |
| /manifest.webmanifest | Existing manifest, unchanged; references /harbor-icon-192.png and /harbor-icon-512.png, with 512px also used for maskable display. |

The existing /harbor-app-icon.svg remains the square artwork source; /harbor-logo.svg remains the in-app logo, but is no longer a separate favicon declaration. There are no app/icon.* or app/apple-icon.* files introducing extra declarations.

Confirmed root cause: the old app/favicon.ico visually contained the starter triangle, while layout metadata separately pointed to Harbor SVG artwork. Replaced that ICO instead of relying on browser icon preference. Replaced the unused legacy public/favicon.svg content and removed unreferenced public/vercel.svg and public/next.svg starter assets. All active icon declarations now agree on Harbor artwork. Next.js icon conventions: https://nextjs.org/docs/app/getting-started/metadata-and-og-images.

### Verification and Safari cache

- TypeScript, ESLint and production build passed. The build used network access for the existing Geist font; the pre-existing middleware deprecation warning remains.
- HTTP checks matched all seven served icon files byte-for-byte against their local assets and verified the rendered ICO/SVG/PNG/Apple link declarations, ICO image sizes and generated mobile CSS.
- FinancialInput passthrough checks covered 123, 123.45, 0.99 and -12.34, unchanged refs/callbacks and absence of an added minimum constraint. All 30 existing domain/local-repository regression checks passed. Actual live account saves were not performed.
- Existing manifest and PWA icon artwork were not modified.
- Physical iPhone keyboard layout, Safari focus/dismiss scale and horizontal position, and browser icon presentation still require a real device/browser check. Served assets and markup were verified; these are not claims of on-device testing.

After deployment, first revisit Harbor and close/reopen its Safari tab. Old history/bookmark suggestions may retain the previous cached icon even when the served files are correct. If it persists, Safari's cache/website-data controls are under Settings > Apps > Safari > Advanced > Website Data; clearing history is a separate, broader option. Clearing site data can sign you out and remove locally stored fallback data, so ensure any local-only data is backed up before doing that. Do not clear all browsing data as a first step or keep restructuring the correct icon configuration. Apple guidance: https://support.apple.com/en-us/105082.
