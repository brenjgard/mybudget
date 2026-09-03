#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const PAGE_SIZE = 1000;

const requiredEnv = [
  "DEV_SUPABASE_URL",
  "DEV_SUPABASE_SERVICE_ROLE_KEY",
  "PROD_SUPABASE_URL",
  "PROD_SUPABASE_SERVICE_ROLE_KEY",
  "DEV_USER_ID",
  "PROD_USER_ID",
];

const tablePlan = [
  {
    name: "budget_settings",
    group: "primary",
    role: "Checking anchor/current settings",
    userColumns: ["user_id"],
    onConflict: "user_id",
    preservesIds: false,
    diagnostics: ["user_id", "checking_balance", "updated_at"],
  },
  {
    name: "payment_accounts",
    group: "primary",
    role: "Waves/Fleet/checking accounts and card cycle settings",
    userColumns: ["user_id"],
    onConflict: "id",
    preservesIds: true,
    collisionColumn: "id",
    diagnostics: ["id", "account_key", "label", "kind", "type"],
  },
  {
    name: "categories",
    group: "primary",
    role: "Charts",
    userColumns: ["user_id"],
    onConflict: "id",
    preservesIds: true,
    collisionColumn: "id",
    diagnostics: ["id", "name"],
  },
  {
    name: "line_items",
    group: "primary",
    role: "Ripples, Waves, one-time obligations, recurrences",
    userColumns: ["user_id"],
    onConflict: "id",
    preservesIds: true,
    collisionColumn: "id",
    diagnostics: ["id", "name", "category_id", "payment_account_id", "is_income", "plan_type"],
  },
  {
    name: "budget_items",
    group: "secondary",
    role: "Native budget model reachable from useHarborMonth",
    userColumns: ["user_id"],
    onConflict: "id",
    preservesIds: true,
    collisionColumn: "id",
    diagnostics: ["id", "name", "category_id", "default_payment_account_id", "legacy_line_item_id"],
  },
  {
    name: "monthly_amounts",
    group: "primary",
    role: "Budget per-week/month overrides",
    userColumns: ["user_id"],
    onConflict: "id",
    preservesIds: true,
    collisionColumn: "id",
    diagnostics: ["id", "line_item_id", "month_key", "week_index", "amount"],
  },
  {
    name: "month_balances",
    group: "primary",
    role: "Budget month starting balances",
    userColumns: ["user_id"],
    onConflict: "id",
    preservesIds: true,
    collisionColumn: "id",
    diagnostics: ["id", "month_key", "starting_balance"],
  },
  {
    name: "closed_months",
    group: "primary",
    role: "Closed/reopened budget months",
    userColumns: ["user_id"],
    onConflict: "id",
    preservesIds: true,
    collisionColumn: "id",
    diagnostics: ["id", "month_key", "ending_balance"],
  },
  {
    name: "closed_weeks",
    group: "primary",
    role: "Closed budget weeks by account",
    userColumns: ["user_id"],
    onConflict: "id",
    preservesIds: true,
    collisionColumn: "id",
    diagnostics: ["id", "payment_account_id", "month_key", "week_index"],
  },
  {
    name: "spend_logs",
    group: "primary",
    role: "Actual spending logged from Budget",
    userColumns: ["user_id"],
    onConflict: "id",
    preservesIds: true,
    collisionColumn: "id",
    diagnostics: ["id", "ripple_id", "payment_account_id", "month_key", "week_index", "amount"],
  },
  {
    name: "actual_transactions",
    group: "secondary",
    role: "Native actual transaction records reachable from useHarborMonth",
    userColumns: ["user_id"],
    onConflict: "id",
    preservesIds: true,
    collisionColumn: "id",
    diagnostics: ["id", "date", "merchant", "category_id", "account_id", "planned_item_id", "legacy_spend_log_id"],
  },
  {
    name: "credit_card_payments",
    group: "secondary",
    role: "Native credit card payment obligations reachable from useHarborMonth",
    userColumns: ["user_id"],
    onConflict: "id",
    preservesIds: true,
    collisionColumn: "id",
    diagnostics: ["id", "credit_card_account_id", "cash_account_id", "amount", "scheduled_date", "source_type"],
  },
  {
    name: "cash_flow_events",
    group: "secondary",
    role: "Native cash flow events reachable from useHarborMonth",
    userColumns: ["user_id"],
    onConflict: "id",
    preservesIds: true,
    collisionColumn: "id",
    diagnostics: ["id", "date", "name", "cash_account_id", "linked_transaction_id", "linked_credit_card_payment_id"],
  },
  {
    name: "dock_item_states",
    group: "primary",
    role: "Dock/Fleet statement state, manual cash events, split schedules",
    userColumns: ["user_id"],
    onConflict: "id",
    preservesIds: true,
    collisionColumn: "id",
    diagnostics: ["id", "month_key", "week_index", "item_id", "item_kind", "status", "planned_amount"],
  },
  {
    name: "cc_charges",
    group: "primary",
    role: "Credit-card charge movements created from spend logging",
    userColumns: ["user_id"],
    onConflict: "id",
    preservesIds: true,
    collisionColumn: "id",
    diagnostics: ["id", "line_item_id", "payment_account_id", "item_name", "amount", "date_moved"],
  },
  {
    name: "buoys",
    group: "primary",
    role: "Dock buoy goals and state",
    userColumns: ["user_id"],
    onConflict: "id",
    preservesIds: true,
    collisionColumn: "id",
    diagnostics: ["id", "name", "current", "goal"],
  },
];

function printHelp() {
  console.log(`
Harbor one-user dev-to-prod migration

Usage:
  node scripts/migrate-harbor-user-dev-to-prod.mjs [--dry-run] [--apply] [--verify-only] [--replace-destination] [--primary-only]

Default mode is --dry-run.

Required environment:
  DEV_SUPABASE_URL
  DEV_SUPABASE_SERVICE_ROLE_KEY
  PROD_SUPABASE_URL
  PROD_SUPABASE_SERVICE_ROLE_KEY
  DEV_USER_ID
  PROD_USER_ID

Modes:
  --dry-run                Read both projects, preflight, and print the planned writes.
  --apply                  Perform writes after preflight checks.
  --replace-destination    Delete the destination user's Harbor rows before migrating source rows.
  --verify-only            Read and report source/destination counts without writing.
  --primary-only           Skip secondary repo-reachable native tables.
  --backup-file=PATH       Backup path for replace --apply. Defaults to .harbor-migration-backups/.
`);
}

function parseArgs(argv) {
  const args = new Set(argv);
  if (args.has("--help") || args.has("-h")) return { help: true };

  if (args.has("--apply") && args.has("--verify-only")) {
    throw new Error("Use either --apply or --verify-only, not both.");
  }

  return {
    apply: args.has("--apply"),
    verifyOnly: args.has("--verify-only"),
    primaryOnly: args.has("--primary-only"),
    replaceDestination: args.has("--replace-destination"),
    backupFile: argv.find((arg) => arg.startsWith("--backup-file="))?.slice("--backup-file=".length),
  };
}

function assertEnv() {
  const missing = requiredEnv.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  if (process.env.DEV_USER_ID === process.env.PROD_USER_ID) {
    throw new Error("DEV_USER_ID and PROD_USER_ID must be different UUIDs.");
  }
}

function createSupabaseClient(url, key) {
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

async function fetchUserRows(client, tableName, userId) {
  const rows = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await client
      .from(tableName)
      .select("*")
      .eq("user_id", userId)
      .range(from, to);

    if (error) throw new Error(`${tableName}: failed to fetch rows: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }

  return rows;
}

function backupPathFor(prodUserId) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.resolve(process.cwd(), ".harbor-migration-backups", `prod-user-${prodUserId}-${timestamp}.json`);
}

function remapRows(rows, devUserId, prodUserId) {
  return rows.map((row) => {
    if (row.user_id !== devUserId) {
      throw new Error(`Source row ownership mismatch. Expected ${devUserId}, got ${row.user_id}.`);
    }
    return { ...row, user_id: prodUserId };
  });
}

async function assertNoForeignIdCollisions(client, table, rows, prodUserId) {
  if (!table.collisionColumn || rows.length === 0) return;

  const ids = rows
    .map((row) => row[table.collisionColumn])
    .filter((value) => value !== null && value !== undefined);

  for (let index = 0; index < ids.length; index += PAGE_SIZE) {
    const chunk = ids.slice(index, index + PAGE_SIZE);
    const { data, error } = await client
      .from(table.name)
      .select(`${table.collisionColumn}, user_id`)
      .in(table.collisionColumn, chunk);

    if (error) throw new Error(`${table.name}: failed collision check: ${error.message}`);

    const collisions = (data ?? []).filter((row) => row.user_id !== prodUserId);
    if (collisions.length > 0) {
      const sample = collisions.slice(0, 5).map((row) => row[table.collisionColumn]).join(", ");
      throw new Error(
        `${table.name}: found ${collisions.length} preserved ID collision(s) owned by another production user. Sample: ${sample}`,
      );
    }
  }
}

async function upsertRows(client, table, rows) {
  if (rows.length === 0) return;

  for (let index = 0; index < rows.length; index += PAGE_SIZE) {
    const chunk = rows.slice(index, index + PAGE_SIZE);
    const { error } = await client
      .from(table.name)
      .upsert(chunk, { onConflict: table.onConflict });

    if (error) throw new Error(`${table.name}: failed to upsert rows: ${error.message}`);
  }
}

async function deleteUserRows(client, table, userId) {
  const { count, error } = await client
    .from(table.name)
    .delete({ count: "exact" })
    .eq("user_id", userId);

  if (error) throw new Error(`${table.name}: failed to delete destination rows: ${error.message}`);
  return count ?? 0;
}

async function writeDestinationBackup(filePath, tables, destinationByTable, prodUserId) {
  const resolvedPath = path.resolve(process.cwd(), filePath);
  const payload = {
    exportedAt: new Date().toISOString(),
    purpose: "Harbor production user backup before replace-destination migration",
    prodUserId,
    tables: Object.fromEntries(
      tables.map((table) => [table.name, destinationByTable.get(table.name) ?? []]),
    ),
  };

  await mkdir(path.dirname(resolvedPath), { recursive: true });
  await writeFile(resolvedPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return resolvedPath;
}

function printInventory(tables) {
  console.log("Migration inventory and dependency order:");
  tables.forEach((table, index) => {
    console.log(
      `${String(index + 1).padStart(2, "0")}. ${table.name} [${table.group}] user columns: ${table.userColumns.join(", ")}; idempotency: ${table.onConflict}; ${table.role}`,
    );
  });
}

function summarizeRows(table, rows) {
  if (!table.diagnostics || rows.length === 0) return [];
  return rows.slice(0, 3).map((row) => {
    const summary = {};
    for (const column of table.diagnostics) {
      if (column in row) summary[column] = row[column];
    }
    return summary;
  });
}

function validateRelationships(rowSets) {
  const issues = [];
  const byName = (name) => rowSets.get(name) ?? [];
  const ids = (name) => new Set(byName(name).map((row) => row.id).filter(Boolean));
  const accountIds = ids("payment_accounts");
  const categoryIds = ids("categories");
  const lineItemIds = ids("line_items");
  const budgetItemIds = ids("budget_items");
  const spendLogIds = ids("spend_logs");
  const transactionIds = ids("actual_transactions");
  const paymentIds = ids("credit_card_payments");

  for (const row of byName("line_items")) {
    if (!categoryIds.has(row.category_id)) issues.push(`line_items ${row.id} missing category ${row.category_id}`);
    if (!accountIds.has(row.payment_account_id)) issues.push(`line_items ${row.id} missing payment account ${row.payment_account_id}`);
  }

  for (const row of byName("budget_items")) {
    if (!categoryIds.has(row.category_id)) issues.push(`budget_items ${row.id} missing category ${row.category_id}`);
    if (row.default_payment_account_id && !accountIds.has(row.default_payment_account_id)) issues.push(`budget_items ${row.id} missing default payment account ${row.default_payment_account_id}`);
    if (row.default_cash_account_id && !accountIds.has(row.default_cash_account_id)) issues.push(`budget_items ${row.id} missing default cash account ${row.default_cash_account_id}`);
    if (row.legacy_line_item_id && !lineItemIds.has(row.legacy_line_item_id)) issues.push(`budget_items ${row.id} missing legacy line item ${row.legacy_line_item_id}`);
  }

  for (const row of byName("monthly_amounts")) {
    if (!lineItemIds.has(row.line_item_id)) issues.push(`monthly_amounts ${row.id} missing line item ${row.line_item_id}`);
  }

  for (const row of byName("closed_weeks")) {
    if (!accountIds.has(row.payment_account_id)) issues.push(`closed_weeks ${row.id} missing payment account ${row.payment_account_id}`);
  }

  for (const row of byName("spend_logs")) {
    if (row.ripple_id && !lineItemIds.has(row.ripple_id)) issues.push(`spend_logs ${row.id} missing ripple ${row.ripple_id}`);
    if (!accountIds.has(row.payment_account_id)) issues.push(`spend_logs ${row.id} missing payment account ${row.payment_account_id}`);
  }

  for (const row of byName("actual_transactions")) {
    if (!categoryIds.has(row.category_id)) issues.push(`actual_transactions ${row.id} missing category ${row.category_id}`);
    if (!accountIds.has(row.account_id)) issues.push(`actual_transactions ${row.id} missing account ${row.account_id}`);
    if (row.planned_item_id && !budgetItemIds.has(row.planned_item_id)) issues.push(`actual_transactions ${row.id} missing planned item ${row.planned_item_id}`);
    if (row.legacy_spend_log_id && !spendLogIds.has(row.legacy_spend_log_id)) issues.push(`actual_transactions ${row.id} missing legacy spend log ${row.legacy_spend_log_id}`);
  }

  for (const row of byName("credit_card_payments")) {
    if (!accountIds.has(row.credit_card_account_id)) issues.push(`credit_card_payments ${row.id} missing card account ${row.credit_card_account_id}`);
    if (!accountIds.has(row.cash_account_id)) issues.push(`credit_card_payments ${row.id} missing cash account ${row.cash_account_id}`);
  }

  for (const row of byName("cash_flow_events")) {
    if (!accountIds.has(row.cash_account_id)) issues.push(`cash_flow_events ${row.id} missing cash account ${row.cash_account_id}`);
    if (row.linked_account_id && !accountIds.has(row.linked_account_id)) issues.push(`cash_flow_events ${row.id} missing linked account ${row.linked_account_id}`);
    if (row.linked_transaction_id && !transactionIds.has(row.linked_transaction_id)) issues.push(`cash_flow_events ${row.id} missing linked transaction ${row.linked_transaction_id}`);
    if (row.linked_credit_card_payment_id && !paymentIds.has(row.linked_credit_card_payment_id)) issues.push(`cash_flow_events ${row.id} missing linked card payment ${row.linked_credit_card_payment_id}`);
  }

  for (const row of byName("dock_item_states")) {
    if ((row.item_kind === "ripple" || row.item_kind === "wave") && !lineItemIds.has(row.item_id)) {
      issues.push(`dock_item_states ${row.id} ${row.item_kind} item missing line item ${row.item_id}`);
    }
  }

  for (const row of byName("cc_charges")) {
    if (row.line_item_id && !lineItemIds.has(row.line_item_id)) issues.push(`cc_charges ${row.id} missing line item ${row.line_item_id}`);
    if (!accountIds.has(row.payment_account_id)) issues.push(`cc_charges ${row.id} missing payment account ${row.payment_account_id}`);
  }

  return issues;
}

function printRelationshipReport(label, issues) {
  if (issues.length === 0) {
    console.log(`${label}: relationship check passed`);
    return;
  }

  console.log(`${label}: relationship check found ${issues.length} issue(s)`);
  for (const issue of issues.slice(0, 20)) {
    console.log(`  - ${issue}`);
  }
  if (issues.length > 20) console.log(`  ... ${issues.length - 20} more`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  assertEnv();

  const devUserId = process.env.DEV_USER_ID;
  const prodUserId = process.env.PROD_USER_ID;
  const dryRun = !options.apply;
  const backupFile = options.backupFile ?? backupPathFor(process.env.PROD_USER_ID);
  const tables = options.primaryOnly
    ? tablePlan.filter((table) => table.group === "primary")
    : tablePlan;
  const deleteTables = [...tables].reverse();

  const dev = createSupabaseClient(process.env.DEV_SUPABASE_URL, process.env.DEV_SUPABASE_SERVICE_ROLE_KEY);
  const prod = createSupabaseClient(process.env.PROD_SUPABASE_URL, process.env.PROD_SUPABASE_SERVICE_ROLE_KEY);

  console.log(`Harbor dev-to-prod migration for one user`);
  console.log(`Mode: ${options.verifyOnly ? "verify-only" : dryRun ? "dry-run" : "apply"}${options.replaceDestination ? " replace-destination" : ""}`);
  console.log(`Source DEV_USER_ID: ${devUserId}`);
  console.log(`Destination PROD_USER_ID: ${prodUserId}`);
  if (options.replaceDestination) console.log(`Replace backup file: ${backupFile}`);
  console.log("");
  printInventory(tables);
  console.log("");

  const sourceByTable = new Map();
  const destinationByTable = new Map();
  const beforeCounts = new Map();

  console.log("Reading source and destination counts...");
  for (const table of tables) {
    const [sourceRows, destinationRows] = await Promise.all([
      fetchUserRows(dev, table.name, devUserId),
      fetchUserRows(prod, table.name, prodUserId),
    ]);
    sourceByTable.set(table.name, sourceRows);
    destinationByTable.set(table.name, destinationRows);
    beforeCounts.set(table.name, destinationRows.length);
    console.log(`${table.name}: source=${sourceRows.length}; destination_before=${destinationRows.length}`);
  }

  console.log("");
  console.log("Preflight: checking ownership remap and preserved-ID collisions...");
  for (const table of tables) {
    const remapped = remapRows(sourceByTable.get(table.name), devUserId, prodUserId);
    await assertNoForeignIdCollisions(prod, table, remapped, prodUserId);
    const samples = summarizeRows(table, remapped);
    if (samples.length > 0) {
      console.log(`${table.name}: sample remapped rows: ${JSON.stringify(samples)}`);
    } else {
      console.log(`${table.name}: no source rows`);
    }
  }

  const expectedRowsByTable = new Map(tables.map((table) => [
    table.name,
    remapRows(sourceByTable.get(table.name), devUserId, prodUserId),
  ]));
  printRelationshipReport("Expected remapped source dataset", validateRelationships(expectedRowsByTable));

  if (options.replaceDestination) {
    console.log("");
    console.log("Replace destination deletion plan, reverse FK-safe order:");
    deleteTables.forEach((table, index) => {
      const rows = destinationByTable.get(table.name) ?? [];
      const samples = summarizeRows(table, rows);
      console.log(`${String(index + 1).padStart(2, "0")}. ${table.name}: would_delete=${rows.length}`);
      if (samples.length > 0) console.log(`    sample: ${JSON.stringify(samples)}`);
    });
  }

  if (options.verifyOnly) {
    console.log("");
    console.log("Verify-only complete. No writes performed.");
    return;
  }

  if (dryRun) {
    console.log("");
    console.log(
      options.replaceDestination
        ? "Dry-run replace complete. No writes or deletes performed. Re-run with --replace-destination --apply to backup, clear, and migrate."
        : "Dry-run complete. No writes performed. Re-run with --apply to migrate.",
    );
    return;
  }

  if (options.replaceDestination) {
    console.log("");
    console.log("Writing destination backup before deletion...");
    const writtenBackupPath = await writeDestinationBackup(backupFile, tables, destinationByTable, prodUserId);
    console.log(`Backup written: ${writtenBackupPath}`);

    console.log("");
    console.log("Deleting destination rows in reverse FK-safe order...");
    for (const table of deleteTables) {
      const deleted = await deleteUserRows(prod, table, prodUserId);
      console.log(`${table.name}: deleted=${deleted}`);
    }
  }

  console.log("");
  console.log("Applying migration with FK-safe ordered upserts...");
  for (const table of tables) {
    const remapped = remapRows(sourceByTable.get(table.name), devUserId, prodUserId);
    await upsertRows(prod, table, remapped);
    console.log(`${table.name}: upserted=${remapped.length}`);
  }

  console.log("");
  console.log("After counts:");
  const afterRowsByTable = new Map();
  for (const table of tables) {
    const afterRows = await fetchUserRows(prod, table.name, prodUserId);
    afterRowsByTable.set(table.name, afterRows);
    const afterCount = afterRows.length;
    const beforeCount = beforeCounts.get(table.name);
    const sourceCount = sourceByTable.get(table.name).length;
    const comparison = afterCount === sourceCount ? "OK" : "DIFF";
    console.log(`${table.name}: source=${sourceCount}; destination_before=${beforeCount}; destination_after=${afterCount}; compare=${comparison}`);
  }

  printRelationshipReport("Production dataset after migration", validateRelationships(afterRowsByTable));

  console.log("");
  console.log("Migration complete.");
}

main().catch((error) => {
  console.error("");
  console.error("Migration failed:");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
