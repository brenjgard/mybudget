# Harbor Dev-to-Prod User Data Migration

This is a one-time local migration for moving one Harbor user's data from the development Supabase project to the production Supabase project.

The script is intentionally service-role only and must be run locally. Do not put service-role keys in browser code or commit them to Git.

## Actual Live Data Graph

The current Budget, Dock, and Settings paths still primarily load Harbor data through:

- `budget_settings`
- `payment_accounts`
- `categories`
- `line_items`
- `monthly_amounts`
- `spend_logs`
- `dock_item_states`
- `cc_charges`
- `buoys`
- `month_balances`
- `closed_months`
- `closed_weeks`

The shared repository/month hook also still exposes native cash-flow tables that can contain active migrated or newer records:

- `budget_items`
- `actual_transactions`
- `credit_card_payments`
- `cash_flow_events`

These secondary/native tables are not the primary Budget/Dock/Settings path today, but they are still active repository tables. In a replacement migration they should be cleared for `PROD_USER_ID` too, otherwise older production-model rows can continue to appear through `useHarborMonth`.

Excluded on purpose:

- `auth.users` and other auth/system tables
- `profiles`, because production auth already owns the prod user identity
- `feedback` and `beta_access_requests`, because they are not Harbor financial configuration/state

## Migration Inventory

| Order | Table | User ownership column | Idempotency key | Why it is copied |
| --- | --- | --- | --- | --- |
| 1 | `budget_settings` | `user_id` | `user_id` | Checking anchor/current settings |
| 2 | `payment_accounts` | `user_id` | `id` | Checking, Fleet/cards, card cycle settings, balance anchors |
| 3 | `categories` | `user_id` | `id` | Charts/categories |
| 4 | `line_items` | `user_id` | `id` | Ripples, Waves, one-time obligations, recurrence settings |
| 5 | `budget_items` | `user_id` | `id` | Native budget table still reachable from `useHarborMonth` |
| 6 | `monthly_amounts` | `user_id` | `id` | Budget amount overrides by month/week |
| 7 | `month_balances` | `user_id` | `id` | Budget month starting balances |
| 8 | `closed_months` | `user_id` | `id` | Closed/reopened month state |
| 9 | `closed_weeks` | `user_id` | `id` | Closed week state by account |
| 10 | `spend_logs` | `user_id` | `id` | Actual spend logged in Budget |
| 11 | `actual_transactions` | `user_id` | `id` | Native actual transaction records |
| 12 | `credit_card_payments` | `user_id` | `id` | Native card obligations/payment schedules |
| 13 | `cash_flow_events` | `user_id` | `id` | Native Dock cash-flow events |
| 14 | `dock_item_states` | `user_id` | `id` | Dock manual events, statement states, split payment rows |
| 15 | `cc_charges` | `user_id` | `id` | Credit-card charge movements |
| 16 | `buoys` | `user_id` | `id` | Dock buoy goals/state |

## Dependency Order

The script inserts in the order above so referenced parent rows already exist:

- `payment_accounts` and `categories` precede `line_items`
- `line_items` precedes `monthly_amounts`, `spend_logs`, and `cc_charges`
- `payment_accounts` precedes `closed_weeks`, `spend_logs`, card payments, transactions, and cash-flow events
- `budget_items` precedes native `actual_transactions`
- `actual_transactions` and `credit_card_payments` precede `cash_flow_events`

## ID Strategy

The script preserves entity IDs for every copied table except `budget_settings`, whose primary key is the remapped production `user_id`.

Preserving IDs is safe here because Harbor relationship columns point at those IDs, and the script preflights production for preserved-ID collisions. If a matching ID already exists for another production user, the script stops before writing so it cannot overwrite unrelated production data.

## Required Environment Variables

```powershell
$env:DEV_SUPABASE_URL="https://DEV_PROJECT.supabase.co"
$env:DEV_SUPABASE_SERVICE_ROLE_KEY="DEV_SERVICE_ROLE_KEY"
$env:PROD_SUPABASE_URL="https://PROD_PROJECT.supabase.co"
$env:PROD_SUPABASE_SERVICE_ROLE_KEY="PROD_SERVICE_ROLE_KEY"
$env:DEV_USER_ID="DEV_AUTH_USER_UUID"
$env:PROD_USER_ID="PROD_AUTH_USER_UUID"
```

## Commands

Dry run, with counts and collision checks:

```powershell
node scripts/migrate-harbor-user-dev-to-prod.mjs
```

Dry run a full replacement. This shows the exact destination rows that would be deleted, in reverse FK-safe order, then shows the source rows that would be migrated:

```powershell
node scripts/migrate-harbor-user-dev-to-prod.mjs --replace-destination
```

Verify counts only:

```powershell
node scripts/migrate-harbor-user-dev-to-prod.mjs --verify-only
```

Apply the migration:

```powershell
node scripts/migrate-harbor-user-dev-to-prod.mjs --apply
```

Apply a full replacement. This writes a production-user backup first, deletes only rows owned by `PROD_USER_ID`, then migrates `DEV_USER_ID` rows remapped to `PROD_USER_ID`:

```powershell
node scripts/migrate-harbor-user-dev-to-prod.mjs --replace-destination --apply
```

Only migrate the primary current Budget/Dock/Settings tables:

```powershell
node scripts/migrate-harbor-user-dev-to-prod.mjs --primary-only --apply
```

## Replace Destination Behavior

`--replace-destination` preserves the production Supabase auth identity but replaces the production Harbor financial/configuration dataset.

Dry-run replace:

- Reads all source rows for `DEV_USER_ID`.
- Reads all destination rows for `PROD_USER_ID`.
- Prints source and destination counts.
- Prints samples of destination rows that would be deleted from every copied table.
- Performs ownership and preserved-ID collision preflight.
- Performs an expected relationship check on the remapped source data.
- Does not write or delete anything.

Apply replace:

- Writes a JSON backup of the current production Harbor rows to `.harbor-migration-backups/` unless `--backup-file=PATH` is provided.
- Deletes destination rows using reverse dependency order.
- Deletes only with `eq("user_id", PROD_USER_ID)`.
- Does not touch `auth.users`, `profiles`, beta access, feedback, system tables, or other users.
- Upserts the remapped source rows in FK-safe order.
- Prints final counts and compares destination-after counts to source counts.
- Runs a relationship check against the production rows after migration.

The replacement operation is not wrapped in a database transaction because it runs through Supabase's REST client. The backup file is therefore intentionally created before the first delete.

## Verification Checklist

Before `--apply`:

- Confirm `DEV_USER_ID` is the real source user in development.
- Confirm `PROD_USER_ID` is the already-created production auth user.
- Confirm dry-run source counts look like the expected Harbor dataset.
- Confirm destination-before counts are either zero or intentionally existing prod rows for that same user.
- Confirm no preserved-ID collision error appears.

After `--apply`:

- Re-run `--verify-only` and compare destination-after counts with source counts.
- Sign into production as the production user.
- Check Settings: Charts, Ripples, Waves, Fleet cards, cycle/due settings, balance anchors.
- Check Budget: monthly/weekly planned rows, allowances, one-time obligations, actual spend.
- Check Dock: checking anchor, manual events, Fleet statement obligations, split payment rows, buoy state.
- Spot-check card-related references: Disney/Capital One/United items should still point to the same card/account IDs.
