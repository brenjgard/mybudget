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


## Cross-browser mobile input requirement

The shared financial-input and form-focus treatment applies to iOS Safari, Chrome on iPhone, and Chrome on Android. It uses native HTML input types, inputMode="decimal" for currency, inputMode="numeric" for integer fields, and a minimum 16px form-control font on narrow screens or coarse-pointer devices. There is no user-agent detection, Safari-specific JavaScript, scripted zoom reset, or restriction on intentional pinch zoom.

The browser/OS chooses the exact keyboard layout; inputMode is a standards-based hint. Existing parsing, validation and persistence remain unchanged. Before calling device verification complete, check each supported browser for decimal entry (123, 123.45, 0.99), negative balances where allowed, focus/dismiss scale and horizontal position, and saving then refreshing. These physical-device checks remain pending; source/markup checks do not substitute for them.


## Follow-up: Budget and Dock hierarchy cleanup

This supersedes the original Budget action matrix above. Fixed and one-time obligations now show **Mark Paid**; allowances show **Log Spend**; income receipt actions use **Mark Received**. Paid, Spent, Received and Skipped labels follow item semantics. Explicit scheduled-expense/allowance settings take priority; older definitions retain the existing behavior inference. No new category-name checks were introduced.

- Checking bills use the existing occurrence completion operation. Card-funded bills and partially recorded bills use the existing dated transaction form under the Mark Paid label, preserving card liability and remaining-payment behavior. Completed/skipped rows retain their existing restrictions; allowances can record multiple purchases.
- Budget month navigation is previous arrow / tappable month-year / next arrow, with a This month shortcut when needed. The native month input remains keyboard accessible. Global Log Spend is a secondary action and opens with a blank amount. Income and card-payment links use user-facing labels.
- Dock has a compact Cash forecast heading followed by Current Balance, Projected End and Lowest Point. Collapsed weeks show dates, This week when applicable, Low and Ends. Expanded weeks retain Start/In/Out/Net, the low-point date and chronological events. Existing sub-$500 risk uses amber; negative balances use red; healthy balances remain neutral.
- Budget/Dock row actions wrap on narrow screens and have at least 44px target height. No forecast calculations, schema, repositories or dependencies changed.

Validation: 31 regression checks pass, including checking/card allowances, fixed/one-time bills, income labels, partial payments, completed/skipped action restrictions and existing forecast scenarios. TypeScript, lint and the production build pass; Next.js retains its existing middleware deprecation notice.

Browser validation used headless Chrome with the production assets, synthetic fixture data and locally mocked authentication/API responses at 320px, 390px and 1280px. Checked horizontal overflow, individual bill/allowance action exclusivity, month navigation and This month reset, global Log Spend opening, and collapsed/expanded Dock contents. Inspected screenshots of mobile rows and weekly tiles. The temporary browser fixture was removed. These checks do not exercise live Supabase writes or physical iPhone/Safari behavior.

## Week-first Dock and mobile Budget redesign

Supersedes the earlier hierarchy notes where they differ. Production screens use saved settings, checking anchors, occurrence states, spend logs, savings plans and existing forecast calculations; mockup figures are not seeded into the app.

- Dock: compact current/projected/lowest summary; checking edits apply after save; 4/8/12-week horizons and previous/next windows retain preceding cash flow. Desktop has selectable horizontal week tiles, incoming/outgoing counts and miniature flows. Mobile disclosures show only dates, This week, Low and Ends while collapsed, with Start/In/Out/Net in a 2x2 grid when expanded.
- Weekly detail: chronological events with projected running balances, contextual actions, inline amount/date edits, category totals and a balance chart showing negative periods. Older unresolved events use a compact disclosure; completed and skipped occurrences remain available in recent history. Skipped occurrences can be restored.
- Occurrence correctness: savings transfers now honor saved amount/date/status; income honors saved dates; projected card fragments are combined before applying a saved total/date override. Source occurrence keys remain intact across date moves. Distinct moved occurrences are not discarded when they share a destination date. Existing card-cycle and allowance replacement calculations remain in use.
- Budget: title/plus header, separate mobile month navigation, accessible action sheet for Log Spend and Add Budget Item, one contextual item action and overflow for edit/skip. Compact mobile summaries and the expanded current week bring item actions forward. Dock allowance actions open the existing dated spending form. Bottom navigation is unchanged.

Validation: production build, TypeScript and ESLint passed. The existing 31 domain/presentation checks, 9 card-payment checks, persistence-failure checks and 8 new Dock regression checks passed. New tests cover savings/income moves and reload, recurring skips/restores, paid bills, negative lows with positive endings, horizon continuity, projected-card overrides and distinct moved occurrences.

Headless Chrome checks used production assets with isolated synthetic repository/auth responses at 320px, 390px and 1440px. Verified no page overflow, collapsed/expanded weeks, 4/8/12 horizons, checking save, occurrence amount/date persistence across reload, moving a savings transfer, Budget add/overflow sheets and a dated allowance logging link. Screenshots were inspected. No live account writes or physical iPhone/Safari tests were performed. The existing Next.js middleware deprecation warning remains.

Known model boundary: multiple dates for the same item within one source weekly record share a persistence key. Dock blocks changing just one of those dates instead of silently changing the whole group; its error directs the user to the schedule in Settings. This redesign does not add a migration for per-date identities. Saved moves retain their source month; the existing month-loading lookback still governs how far back records are retrieved.

## Desktop guide completion (October 12, 2026)

The earlier implementation did not complete the desktop reference. This pass replaces its desktop day-card layout with the complete week workspace while retaining the separate mobile layout.

| Reference requirement | Implementation |
| --- | --- |
| Sidebar and active Dock navigation | Desktop-only Dock sidebar reuses Harbor's actual Budget, Dock, Fleet and Settings routes plus existing account actions. No invented Reports route. Mobile bottom navigation remains unchanged. |
| Compact title, time controls, checking | Sticky desktop Cash Flow header, week-by-week arrows, 4/8/12 horizons, checking amount/timestamp and edit control. Mobile retains Balance, Projected End and Lowest Point. |
| Weekly tiles | Eight tiles fit the wide desktop view; narrower screens and longer horizons scroll within the tile strip. Seven-day inflow/outflow bars, transaction counts, ending balances, low balances and negative warnings use forecast data. |
| Selected week | Start/In/Out/End/Low summary, risk badge, largest outflow and remaining/total transaction count. |
| Spreadsheet-style detail | Date, description, category, signed amount, projected running balance, status and actions in a semantic desktop table. Completed events remain visible as recorded and do not reduce projections again. |
| Quick actions | Row-level paid/received/transferred, move-date, amount edit and skip; checkbox selection supports batch move/skip. Amount edit operates on one selected row. Failed saves retain their draft and report errors. |
| Add to selected week | Add transaction preselects the selected week's date (or the checking anchor for a partial first week). Uses existing one-time cash-event persistence. Available in mobile expanded weeks too. |
| Direct allowance spending | Dock now opens a compact Log Spend form itself, with the existing spend-log repository. The source occurrence identity is retained if its planned date was moved, so the actual replaces that allowance once. |
| Weekly visuals | Side-by-side desktop balance chart and inflow/outflow categories; axes, daily labels, zero baseline, negative line segments, lowest/end callouts and proportional category bars. Mobile stacks these within expanded cards. |
| Other weeks | Compact desktop week summaries below the detail select another week. Mobile collapsed cards still show only dates/This week/Low/Ends/disclosure, and expanded cards retain the 2x2 Start/In/Out/Net layout. |

Validation: production build, TypeScript and lint; 31 existing domain checks, 9 card-payment checks, persistence-failure checks and 9 Dock regression checks. `scripts/verify-dock-browser.cjs` exercises built production assets with mocked authentication/repositories: desktop table, single edits, batch moves/skips, contextual add, income receipt, direct spending, rejected-save recovery, reload, checking edits, horizons, navigation and mobile actions. Screenshots inspected at 1440px, 1024px and 390px; overflow checks also cover 320px. Requires a production build and Chrome (optional `CHROME_PATH` override). Fixtures and screenshots remain isolated from live account data; screenshots are written to a temporary folder. No live Supabase writes or physical iPhone checks were performed.

## Home, mobile navigation and checking reconciliation (October 13, 2026)

This completes the final reference pass and supersedes the earlier navigation notes.

- Home is a separate overview at /home; / and /dashboard redirect there. It displays saved checking and its update time, this week's budget summary, recent spending and links to the working screens. Production data comes from the existing repositories.
- Mobile navigation has five destinations: Home, Budget, Dock, Fleet and Settings. The duplicate mobile brand header is removed, active destinations are marked, and bottom safe-area spacing is retained. Desktop uses the same destinations in its sidebar.
- Budget item details expose the contextual primary action, spending history and secondary edit/skip actions. Fleet's compact cards show actual current and statement balances. Settings opens organized sections and existing account controls; unsupported mockup features and credit limits are not fabricated.
- Dock opens on the current week even when checking was last updated in August. Calculations retain the preceding cash flow from that saved anchor, while the top lowest-point summary describes the displayed forecast window.
- Updating checking snapshots unresolved earlier occurrences before saving the new balance, then offers Manage one by one, Skip all past occurrences, or Keep unresolved / review later. Older activity is excluded from the new forecast so it is not deducted again. Same-day activity is not bulk reconciled.
- The backlog survives reloads and later checking updates through existing occurrence records and an earliest-unresolved-month lookup. Skips retain history and future recurring instances. Shared weekly records containing future dates are excluded from bulk skipping.
- Failed snapshot writes prevent advancing the checking anchor. Failed authenticated checking reads/writes remain visible rather than silently using local data. Partial bulk-skip failures retain successful saves and allow retrying the remainder. Event mutations are locked during checking reconciliation. No database migration is required.

Final verification: production build (including TypeScript), ESLint, 6 checking-reconciliation checks, 9 Dock regression checks, 9 card-payment checks, 31 domain/presentation checks, and persistence-failure checks pass. Both production-asset Chrome suites pass: desktop edits/actions/charts/horizons and mobile navigation/reconciliation, including individual skip, partial bulk failure/retry, failed anchor save and reload persistence. Screenshots were reviewed; overflow and active navigation were checked on all five mobile routes at 320px, with additional 390px mobile and 1024/1440px desktop coverage. The browser harness now waits for checking-save completion instead of relying on a fixed delay.

Browser fixtures are isolated synthetic data; production screens use saved account data. Live Supabase writes and physical iPhone/Safari behavior were not tested. The existing Next.js middleware deprecation notice remains.

## Card obligations moved to Home

Removed the obligations panel from Dock and added a compact Home list with card names, due dates, projected payment amounts, an expandable calculation and a View Fleet link. Saved card cycles and their payment months are loaded through the existing repositories and projection helpers; forecast arithmetic is unchanged. Empty, loading, error and retry states are included. Calculation details are collapsed on mobile.

Validation: production build, TypeScript and ESLint passed. The isolated production-browser suite verified the real projection path with a fixture card, expanded calculation details, removal from Dock, and no horizontal overflow at 320px; a 390px screenshot was reviewed. No live account writes were performed.

### Home obligations visual expansion

Expanded the compact obligations list into a Home dashboard section: a navy summary with total projected payments and earliest projected due date, followed by spacious account cards with large amounts, billing cycles, due-date bands and expandable calculation details. Cards stack on mobile and use two columns on desktop. All values remain derived from saved data and existing calculations.

Validation: production build/TypeScript and lint passed. Production-browser checks passed at 320px mobile and 1440px desktop, with screenshots reviewed at 390px and 1440px. Disclosure controls and the Fleet link remain accessible; existing bottom navigation is preserved.

### Statements and card balance check-in on Home

Home now separates current-cycle forecasts from recorded actual statements. Each account shows its saved balance and check-in timestamp, projected payment and due date, and statement totals with paid, outstanding and scheduled amounts using Fleet's shared statement-progress logic. Missing statements are labeled as not entered. Statement management remains in Fleet. Zero-balance cards remain available for check-in.

Check in balance opens a mobile sheet with the expected balance from recorded activity, an input for the provider's actual balance and a difference explanation. Saving updates only the selected payment account's balance/timestamp through a focused authenticated repository update. It does not change checking, mark statements paid, or rewrite other settings. Failed saves retain the draft for retry; successful saves refresh Home and persist to Fleet. No migration is required.

Validation: production build/TypeScript, ESLint, card-payment and repository failure tests passed. The isolated browser suite exercised a partially paid statement, check-in failure/retry, reload and Fleet persistence, and asserted unchanged statement history and checking anchor. Mobile/desktop layout checks passed. No live account data was changed.

## Refined Home obligations summary

Supersedes the expanded account-card layout above. Home uses light white cards and rose/blue/teal summary tiles, compact actionable account rows, and the statuses Statement still to pay, Payment scheduled, Paid, and Projected next cycle. Full statement/payment/calculation details remain in Fleet; card links open the selected account. Check in balances remains available through a card chooser and the existing protected save flow. Existing five-tab mobile navigation is preserved.

Unpaid statement dollars are partitioned: still to pay is outstanding less scheduled coverage, and scheduled coverage is capped at outstanding. Neither counts paid dollars. Partial scheduling can yield two explicitly labeled portions for the same statement. Next due aggregates those portions for the earliest card/date and is labeled as a dated view, not an additional obligation. Actual statements supersede same-cycle forecast rows. Only the latest paid statement per card appears on Home.

Validation: build/TypeScript, lint, summary regression tests (partial/full/over-scheduling, paid/skipped/legacy records and same-cycle forecast suppression), and existing card-payment checks passed. Browser checks cover the 0 still-to-pay / 200 scheduled fixture, check-in failure/retry and persistence, Fleet account links, and responsive widths from 320 to 1440px. Screenshots reviewed; no live account writes.

## Daily Home redesign (October 18, 2026)

Home now follows the supplied daily-control-panel mockup and uses the exact supplied public/Background_design.png coastal artwork in a readable responsive header.

- Checking and cash outlook share the first panel. Update balance works directly on Home, using the same extracted snapshot-before-anchor save operation as Dock. Earlier activity offers individual review in Dock, safe bulk skip, or review later. Failed saves remain visible.
- The outlook uses the production Dock event, projection and weekly forecast functions. Its eight-week horizon matches Dock's default, including prior cash flow from an old checking anchor. It displays negative/healthy status, low/date, end/date and a small real-data visual; no timeline is duplicated.
- Budget retains the existing weekly summary calculation and adds a simple spent progress indicator. Credit cards now prioritize saved balances, freshness labels, and direct update buttons using the existing Home check-in form and focused card persistence.
- Upcoming payments use a unified strip and compact rows, not additional account tiles. Empty states use plain language; projections carry an estimate marker. Scheduled entries use their saved payment dates. Paid history and detailed calculations stay in Fleet.
- Root already redirected to Home. The manifest now launches /home; sign-in, sign-up and authentication fallback destinations use /home while preserving intentional next-path and beta-approval flows.
- The server-rendered Home shell immediately includes the new header, checking/outlook, Budget and credit-card skeletons. The old overview and recent-spending cards no longer render first. Floating Feedback was removed while retaining the sidebar/Settings-triggered feedback dialog. Existing bottom navigation remains.

Validation: build/TypeScript and ESLint pass; existing 31 domain, 9 card-payment, 9 Dock, 6 reconciliation and persistence tests pass, plus summary tests covering actual scheduled dates. Isolated Chrome checks confirm Home/Dock low/end parity, healthy and negative states, checking-save failure/retry/reconciliation, hard refresh, real client navigation via production RSC assets, server skeleton content, and 320/390/768/1024/1440px layouts. Card updates, reload/Fleet persistence, and statement summary checks pass. Desktop and mobile screenshots were reviewed. Existing Dock browser regressions pass. Auth/manifest destinations were checked in code; physical installed-iPhone launch, live login and live Supabase writes were not performed. The existing Next.js middleware deprecation warning remains.

### Section loading indicators

Added a compact version of Harbor's existing animated boat/anchor loading indicator. Home checking, cash outlook, weekly Budget and card-payment loading now pair labeled indicators with the existing skeletons. Dock forecast refresh/metrics, Budget month changes, Fleet activity, Accounts and Spending use the same component. Existing reduced-motion behavior disables the anchor animation, and status labels remain available to assistive technology.

Validation: production build/TypeScript, lint and the Home browser suite pass, including the server-rendered loading shell, hard refresh, client navigation and responsive widths.
