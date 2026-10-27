# Date, forecast, card, Dock and Budget audit

Audit date: October 27, 2026. This is a source-code audit with synthetic production-engine reproductions, not an inspection of the user's live account or deployed version.

## Incident and conclusion

The reported sequence matters: the low fell on app load, before any edits. Checking, card balance/refund, paid statuses and spending were updated afterward. Those later actions cannot explain the original drop.

There is not enough historical account data to identify the exact cause. The original approximately $1,100 low was described over eight weeks; the later double-digit low was described over twelve weeks. Different date windows cannot be compared as equivalent forecasts.

The automatic rolling-window behavior can reproduce almost the exact symptom. With $1,100 checking and a $1,000 bill on December 15, the eight-week window opened October 24 ends December 12 and has a $1,100 low. Opening October 26 starts the window one Sunday later, ends December 19 and has a $100 low. No record changed; all seven overlapping weeks match exactly. A twelve-week view can similarly expose later obligations excluded from an eight-week view. October 25 to October 27 itself does not cross a Sunday; this explanation depends on the actual visit dates and low-point dates.

With a saved checking timestamp and unchanged inputs, the October 25 and October 27 forecasts in the regression fixture are identical. Ordinary daily passage does not itself rewrite paid statuses or card balances in the active forecast engine. A card cycle is anchored to the saved balance timestamp rather than automatically moving to today's cycle. Missing timestamps and partial data loads are exceptions discussed below.

## Corrections implemented locally

| Issue | Previous behavior | Correction and evidence |
| --- | --- | --- |
| Card source month missing from Home/Dock loads | History started 21 days before checking's anchor or at the earliest unresolved record. A card balance is emitted by its statement-closing source month. An older source month could be omitted even when its payment was in the future. Updating the card could then reintroduce the debt despite a lower balance. | Both Home and Dock now include every saved card snapshot month and subsequent activity. A September 30 snapshot of $2,500, October 25 checking of $5,000, and October 28 payment now correctly produce a $2,500 low. Replacing the card snapshot on October 27 with $1,400 produces $3,600, an improvement. This explains a possible later check-in effect, not the reported initial pre-edit drop. |
| Cloud budget read silently fell back | `getMonthlyAmounts` swallowed authentication/database errors and returned local browser amounts, often empty. Default amounts could then replace saved overrides without an error. This can happen on load. | Cloud failures now propagate so Home/Dock can show an error. Signed-out local mode still works. Persistence checks cover both authentication and database failures. |
| UTC timestamps interpreted as local date-only strings | Splitting a timestamp at `T` used its UTC day, unlike checking's local date conversion. Evening check-ins could land on the next day or next statement cycle. | A shared calendar-date helper converts timestamps to the user's local calendar day and validates date-only values. October 28 at 01:00 UTC remains October 27 in New York. Card allocation, expected balance, cleared dates and forecast parsing use this convention. |
| Snapshot-day card purchases counted twice | Forecast card spending included purchases on the balance snapshot date, but expected-card-balance logic excluded them as already included. | Forecast and obligation summaries now consistently include logged spending strictly after the snapshot day. A $1,000 balance with a $200 snapshot-day purchase forecasts $1,000, not $1,200. Logs contain a purchase day, not a purchase time: later purchases on the same day cannot reliably be separated from those already reflected in the snapshot. |
| Explicit zero restored a default | Truthy fallbacks treated zero as absent in allowance budget totals and card spending forecasts. Zero Dock adjustments could also restore planned spending. | Nullish fallbacks preserve explicit zero. Regression checks cover saved monthly amounts, Dock adjustments and monthly allowances. |
| One-time card item counted in adjacent source months | A one-time event in a shared calendar week was eligible in both adjacent months. Projected card fragments were then summed, doubling its liability. | One-time occurrences must belong to the selected source month. November 1 produces one $300 obligation across October/November. |
| Saturday timestamps failed week membership | Calendar week ends were Saturday midnight. A Saturday afternoon `now` failed the inclusive date comparison, breaking current-week classification and Budget summaries. | Week membership compares calendar days. October 31 at 4 p.m. belongs to the final October week. |

Primary implementation: `app/lib/forecast-history.ts`, `app/lib/calendar-date.ts`, `app/lib/harbor-domain.ts`, `app/lib/card-payments.ts`, `app/lib/schedule.ts`, `app/lib/home-cash-outlook.ts`, `app/dock/page.tsx`, and `app/lib/repositories/budget-repo.ts`.

## Additional confirmed model gaps, not corrected in this patch

These were examined separately from the narrow corrections above. They require changes to liability attribution, payment scheduling or legacy compatibility. Passing regression checks does not establish that these cases are correct.

1. **A scheduled payment can duplicate future projected spending.** `allocatedCardBalance` subtracts scheduled payments from the current balance anchor, with a zero floor. Any payment coverage exceeding that anchor is not applied to future spending fragments. Reproduction: zero current balance, $1,000 forecast purchase on October 15, and a $1,000 scheduled payment for November 15 emits both a $1,000 projected payment and the $1,000 manual payment for November 15. This understates checking by $1,000. Coverage should be reconciled once against the fully aggregated card/cycle obligation, preserving distinct payment dates.

2. **An unpaid statement without scheduled payment children is absent at its due date.** `cardPaymentRecords` includes payments and legacy paid receipts, not an unpaid statement header. Reproduction: October 10 card snapshot $2,500, October 30 closing day, November 15 active-cycle due date, and $1,000 unpaid statement due October 15 emits only $2,500 on November 15. The earlier obligation is deferred in cash flow even though Home can show it as still to pay. Fixing this requires partitioning current liability into closed statements and the open cycle, then projecting the unscheduled outstanding remainder on the correct date.

3. **A positive card balance without an update timestamp is omitted from projected payments.** The opening anchor is emitted only when an anchor cycle exists. Reproduction: $2,500 current balance, valid closing/due days, no `currentBalanceUpdatedAt`, no purchases/payments: no card cash event. Legacy records need an explicit check-in or a deliberate migration rule; silently inventing a historical snapshot date would be unreliable.

4. **Actual card spending is subtracted repeatedly for multiple occurrences in one week/cycle.** `cardBudgetForecastByDueDate` subtracts the same item/week/due-date actual total separately from each occurrence. Reproduction: $100 Monday/Wednesday plan during October 2026 (eight post-snapshot occurrences before October 30), one $100 October 5 actual, October 1 zero balance snapshot: November 15 obligation is $700 rather than $800. The same $100 actual consumes both occurrences in its week. Matching actuals to individual occurrences or consuming the actual bucket once would avoid the understatement.

5. **A saved projected-payment amount overrides fresh estimates.** `mergeDockEvents` intentionally gives saved `actualAmount` precedence after summing fragments. A lowered card balance/refund will not reduce an explicitly adjusted payment amount. A plain `upcoming` state materialized during checking reconciliation can also carry an amount. The UI does not distinguish a deliberately fixed payment from a previously materialized estimate. A future change should make those semantics explicit rather than indiscriminately removing user adjustments.

6. **Missing checking timestamps rebase the forecast on each visit.** Both loaders use today when there is no saved checking date. Earlier unresolved events then fall out of the active range without a new balance measurement. This can change a low on load. Cloud settings generally provide a timestamp, but local/legacy snapshots can lack one. An explicit initial confirmation is safer than guessing when a legacy balance was measured.

7. **A current balance update reassigns residual liability to the new snapshot's cycle.** Remaining current balance, after allocated payments, is assigned to `cardCycleForDate(snapshot)`. Total card balance alone cannot identify how much belongs to an already closed statement versus the open cycle. Crossing the closing day between check-ins can move money to a different due date. Refunds likewise are not attributed to a particular statement or payment schedule. This affects later edits, not the pre-edit initial drop.

8. **Preferred payment dates can precede statement close.** A specific preferred day is placed directly in the due month. Closing October 10, due October 25, preferred day 5 yields October 5, before that statement closes. A large days-before-due offset can do the same. Future spending can consequently be projected as paid before it occurs. Date validation needs a defined policy for this case.

9. **Zero checking is still treated as missing by legacy anchor adapters.** Both local `getAnchorOverride` and cloud `getCheckingAnchor` translate zero to null. Current Home/Dock normally fall back to the same zero in settings, but the repository contract cannot distinguish an explicit zero from an absent anchor. This is separate from the fixed zero spending-budget bug.

10. **Other legacy repository paths still silently fall back.** Monthly amounts are now protected, as are active checking, card-state and spend-log paths already covered by existing regression checks. Legacy budget items, native cash events and other adapters still contain fallback behavior and use a separate engine. Those paths should not be treated as equivalent to the active Home/Dock pipeline.

## Coverage and model assumptions

- Active Home cash outlook, Dock loading and navigation, four/eight/twelve-week horizons, chronological event projection, intra-day lows, Sunday windows, DST-safe week offsets, month/year boundaries, and snapshot reconciliation.
- Card snapshots, expected balances, allocated payment records, statement headers/children, partial/scheduled/paid/skipped payments, duplicate receipts, projected fragment merging and manual overrides.
- Weekly/monthly allowance and scheduled-expense plans, one-time items, recurrence/date generation, saved weekly amounts, actual logs, Budget summaries, checking transfers and checking versus card cash movement.
- Local/cloud repositories, date/timestamp persistence, initial setup records, Fleet/Home card entry paths and the older `useHarborMonth` / `cash-flow-model` / spreadsheet adapters.
- The active Budget/Dock calendar uses Sunday–Saturday weeks. Legacy `getWeekRanges` uses Saturday-based weeks and a month-ownership rule. Numeric week indexes are not interchangeable between these models. Legacy screens remain a consistency risk if used against records created by current screens.
- Recurrence generation uses calendar arithmetic and UTC day differences for DST-safe interval calculations. Numeric day 31 is skipped in shorter months; the explicit `last` option means the final calendar day. This is existing behavior rather than a universal end-of-month clamp.
- Cash lows include intermediate event balances and assume income arrives before outgoing items on the same date. Bank posting order could produce a lower real intra-day balance.
- Calendar dates follow the browser's timezone. They are not pinned to an account-specific timezone; traveling/changing timezone can reinterpret timestamps near midnight.
- Checking is a measured anchor; marking an item done excludes its future impact without automatically changing checking. A bank snapshot and paid statuses must describe a consistent point in time. Earlier unresolved occurrences are retained for review and excluded after advancing the anchor.
- Extending history to include older card snapshots increases the number of month reads for very stale records. No database schema change is needed for this patch.

## Validation

Passed:

- `node scripts/verify-forecast-date-audit.cjs`: eight new production-code checks, with New York timezone, including stable unchanged two-day reloads and the Sunday $1,100-to-$100 reproduction.
- `node scripts/verify-card-payments.cjs`: nine payment checks.
- `node scripts/verify-dock-redesign.cjs`: nine Dock checks.
- `node scripts/verify-dock-reconciliation.cjs`: six reconciliation checks.
- `node scripts/verify-card-persistence.cjs`: authentication/read/write/delete failure checks, including the new monthly-amount failure cases.
- `node scripts/verify-home-card-summary.cjs` and `node scripts/verify-harbor-polish.cjs` (31 checks in the latter).
- TypeScript, ESLint and production build. The build retains the existing Next middleware-convention deprecation warning.

The final two small changes (monthly-read failure handling and additional regression assertions) are rechecked with TypeScript/ESLint and the affected runners after the production build. No browser session, real bank history, live Supabase account or production deployment was modified or verified.

## Evidence needed to attribute the reported account change

The old and new low dates and exact visible date ranges are more useful than the low amounts alone. Also useful: checking balance's last-updated timestamp before the later edits, each card's closing/due days and snapshot dates, saved manual/projected payment amounts, and which transactions enter the newly visible weeks. Because the balances and statuses have since changed, a present screenshot alone cannot recreate the original pre-edit input set. Historical screenshots or saved records would allow an event-by-event comparison. The code currently has no durable forecast-snapshot history that can reconstruct the previous visit automatically.
