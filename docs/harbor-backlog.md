# Harbor Backlog

## Separate Budget Attribution From Cash Timing

Potential future model:

- `budget_period`
- `scheduled_date`
- `cash_date`

This could let Harbor represent an expense as belonging to one budget period while the cash leaves checking in another period. That is intentionally not part of the current Dock refinement; the app currently keeps a simpler deterministic date model where effective transaction/payment dates determine weekly placement.

## Ground-Up Budget, Dock, And Settings Model

Current refactor direction:

- `/budget` answers spending-plan performance with Budgeted, Spent, and Remaining.
- `/dock` answers cash sufficiency with Checking Now, projected month end, lowest projected balance, weekly forecast summaries, and chronological drill-down.
- `/settings` remains the place where Harbor defines financial rules: accounts, income, bills, recurring spending, categories, and preferences.

Useful current structures to preserve:

- `line_items` for recurring and one-time financial definitions.
- `spend_logs` for actual spending that updates Budget immediately.
- `dock_item_states` for operational cash-event state such as Upcoming and Done.
- credit-card settings for statement close date, due date, and preferred payment timing.
- anchor/checking balance storage for the current forecast starting point.

Future schema/domain work to inspect before migration:

- explicit generated occurrences rather than deriving every occurrence directly in UI routes;
- credit-card statement obligations with one or more scheduled payments;
- persisted Budget wrap results separate from Dock reconciliation;
- intentional savings-transfer events created from under-budget wrap choices;
- a clearer split between financial definitions, generated occurrences, actual spending, card obligations, scheduled cash payments, and reconciliation state.

Do not delete existing user financial records during this work. If a legacy field cannot map cleanly to the target model, document the gap before adding destructive migration behavior.
