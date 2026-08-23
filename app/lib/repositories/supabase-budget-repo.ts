"use client";

import { createClient } from "../supabase/client";
import type { CCCharge } from "../local-repo";
import type { Buoy } from "../local-repo";
import type { AppSettings, DockItemKind, DockItemState, DockItemStatus, FrequencyType, ItemBehavior, LineItem, PaymentMethod, PreferredPaymentTiming, Recurrence, RipplePlanType, RippleType, SpendLogEntry } from "../types";

type User = {
  id: string;
};

type BudgetSettingsRow = {
  checking_balance: number | string | null;
  updated_at?: string | null;
};

type PaymentAccountRow = {
  id: string;
  account_key: string;
  kind: "checking" | "credit";
  label: string;
  current_balance?: number | string | null;
  current_balance_updated_at?: string | null;
  statement_closing_day?: number | null;
  payment_due_day?: number | null;
  preferred_payment_timing?: PreferredPaymentTiming | null;
  preferred_payment_days_before_due?: number | null;
  preferred_payment_day?: number | null;
};

const PAYMENT_ACCOUNT_COLUMNS = "id, account_key, kind, label, current_balance, current_balance_updated_at, statement_closing_day, payment_due_day, preferred_payment_timing, preferred_payment_days_before_due, preferred_payment_day";

type CategoryRow = {
  id: string;
  name: string;
};

type LineItemRow = {
  id: string;
  category_id: string;
  payment_account_id: string;
  name: string;
  default_amount: number | string;
  is_income: boolean;
  frequency: string;
  anchor_date: string | null;
  anchor_month: number | null;
  wave_type?: "recurring" | "oneTime" | null;
  one_time_date?: string | null;
  recurrence?: Recurrence | null;
  ripple_type?: RippleType | null;
  plan_type?: RipplePlanType | null;
  preferred_payment_date?: string | null;
  payment_due_date?: string | null;
};

type MonthlyAmountRow = {
  line_item_id: string;
  week_index: number;
  amount: number | string;
};

type MonthBalanceRow = {
  month_key: string;
  starting_balance: number | string;
};

type ClosedMonthRow = {
  month_key: string;
};

type ClosedWeekRow = {
  payment_account_id: string;
  week_index: number;
};

type CCChargeRow = {
  line_item_id: string | null;
  payment_account_id: string;
  item_name: string;
  card_label: string;
  amount: number | string;
  week_label: string;
  date_moved: string;
};

type SpendLogRow = {
  id: string;
  user_id: string;
  month_key: string;
  week_index: number;
  ripple_id: string | null;
  payment_account_id: string;
  amount: number | string;
  spend_date: string;
  note: string | null;
  created_at: string;
  updated_at: string | null;
};

type DockItemStateRow = {
  id: string;
  user_id: string;
  month_key: string;
  week_index: number;
  item_id: string;
  item_kind: DockItemKind;
  behavior_type: ItemBehavior;
  status: DockItemStatus;
  status_updated_at: string | null;
  planned_amount: number | string | null;
  actual_amount: number | string | null;
  pending_until: string | null;
  cleared_at: string | null;
  note: string | null;
  created_at: string;
  updated_at: string | null;
};

type BuoyRow = {
  id: string;
  name: string;
  current: number | string;
  goal: number | string;
  auto_save: number | string | null;
  auto_save_day: number | null;
  last_auto_save: string | null;
};

type SupabaseLikeError = {
  message?: string;
  details?: string;
  hint?: string;
  code?: string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string) {
  return UUID_RE.test(value);
}

function readableSupabaseError(error: unknown, context: string): Error {
  if (error instanceof Error) return error;

  if (error && typeof error === "object") {
    const supabaseError = error as SupabaseLikeError;
    const parts = [
      supabaseError.message,
      supabaseError.details,
      supabaseError.hint,
      supabaseError.code ? `Code: ${supabaseError.code}` : undefined,
    ].filter(Boolean);

    if (parts.length > 0) {
      return new Error(`${context}: ${parts.join(" ")}`);
    }

    try {
      return new Error(`${context}: ${JSON.stringify(error)}`);
    } catch {
      return new Error(`${context}: Unknown Supabase error`);
    }
  }

  return new Error(`${context}: ${String(error)}`);
}

function throwSupabaseError(error: unknown, context: string): never {
  throw readableSupabaseError(error, context);
}

function closedWeekKey(monthKey: string, cardId: string, weekIndex: number) {
  return `${monthKey}-${cardId}-${weekIndex}`;
}

function fromBuoyRow(row: BuoyRow): Buoy {
  return {
    id: row.id,
    name: row.name,
    current: Number(row.current),
    goal: Number(row.goal),
    autoSave: row.auto_save === null ? undefined : Number(row.auto_save),
    autoSaveDay: row.auto_save_day ?? undefined,
    lastAutoSave: row.last_auto_save ? row.last_auto_save.slice(0, 7) : undefined,
  };
}

function toLastAutoSaveDate(monthKey: string | undefined): string | null {
  if (!monthKey) return null;
  return monthKey.length === 7 ? `${monthKey}-01` : monthKey.slice(0, 10);
}

async function getUser(): Promise<User | null> {
  const supabase = createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) throw error;
  return user ? { id: user.id } : null;
}

function buildSettingsFromSupabase({
  budgetSettings,
  paymentAccounts,
  categories,
  lineItems,
}: {
  budgetSettings: BudgetSettingsRow | null;
  paymentAccounts: PaymentAccountRow[];
  categories: CategoryRow[];
  lineItems: LineItemRow[];
}): AppSettings | null {
  if (!budgetSettings || budgetSettings.checking_balance === null) {
    return null;
  }

  const categoryNamesById = new Map(categories.map((category) => [category.id, category.name]));
  const accountKeysById = new Map(paymentAccounts.map((account) => [account.id, account.account_key]));

  return {
    checkingBalance: Number(budgetSettings.checking_balance),
    creditCards: paymentAccounts
      .filter((account) => account.kind === "credit")
      .map((account) => ({
        id: account.account_key as PaymentMethod,
        label: account.label,
        currentBalance: account.current_balance === null || account.current_balance === undefined ? undefined : Number(account.current_balance),
        currentBalanceUpdatedAt: account.current_balance_updated_at ?? undefined,
        statementClosingDay: account.statement_closing_day ?? undefined,
        paymentDueDay: account.payment_due_day ?? undefined,
        preferredPaymentTiming: account.preferred_payment_timing ?? undefined,
        preferredPaymentDaysBeforeDue: account.preferred_payment_days_before_due ?? undefined,
        preferredPaymentDay: account.preferred_payment_day ?? undefined,
      })),
    categories: categories.map((category) => category.name),
    lineItems: lineItems.map<LineItem>((item) => ({
      id: item.id,
      category: categoryNamesById.get(item.category_id) ?? "",
      name: item.name,
      defaultAmount: Number(item.default_amount),
      paymentMethod: (accountKeysById.get(item.payment_account_id) ?? "checking") as PaymentMethod,
      isIncome: item.is_income,
      frequency: item.frequency as FrequencyType,
      anchorDate: item.anchor_date ?? undefined,
      anchorMonth: item.anchor_month ?? undefined,
      waveType: item.wave_type ?? "recurring",
      oneTimeDate: item.one_time_date ?? undefined,
      recurrence: item.recurrence ?? undefined,
      rippleType: item.ripple_type ?? undefined,
      planType: item.plan_type ?? undefined,
      preferredPaymentDate: item.preferred_payment_date ?? undefined,
      paymentDueDate: item.payment_due_date ?? undefined,
    })),
  };
}

function fromSpendLogRow(row: SpendLogRow, accountKeysById: Map<string, string>): SpendLogEntry {
  return {
    id: row.id,
    userId: row.user_id,
    monthKey: row.month_key,
    weekIndex: row.week_index,
    rippleId: row.ripple_id ?? "",
    amount: Number(row.amount),
    paymentMethod: (accountKeysById.get(row.payment_account_id) ?? "checking") as PaymentMethod,
    date: row.spend_date,
    note: row.note ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? undefined,
  };
}

function fromDockItemStateRow(row: DockItemStateRow): DockItemState {
  return {
    id: row.id,
    userId: row.user_id,
    monthKey: row.month_key,
    weekIndex: row.week_index,
    itemId: row.item_id,
    itemKind: row.item_kind,
    behaviorType: row.behavior_type,
    status: row.status,
    statusUpdatedAt: row.status_updated_at ?? undefined,
    plannedAmount: row.planned_amount === null ? undefined : Number(row.planned_amount),
    actualAmount: row.actual_amount === null ? undefined : Number(row.actual_amount),
    pendingUntil: row.pending_until ?? undefined,
    clearedAt: row.cleared_at ?? undefined,
    note: row.note ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? undefined,
  };
}

async function loadSettingsForUser(userId: string): Promise<AppSettings | null> {
  const supabase = createClient();
  const [budgetSettingsResult, paymentAccountsResult, categoriesResult, lineItemsResult] = await Promise.all([
    supabase
      .from("budget_settings")
      .select("checking_balance")
      .eq("user_id", userId)
      .maybeSingle<BudgetSettingsRow>(),
    supabase
      .from("payment_accounts")
      .select(PAYMENT_ACCOUNT_COLUMNS)
      .eq("user_id", userId)
      .order("sort_order", { ascending: true })
      .returns<PaymentAccountRow[]>(),
    supabase
      .from("categories")
      .select("id, name")
      .eq("user_id", userId)
      .order("sort_order", { ascending: true })
      .returns<CategoryRow[]>(),
    supabase
      .from("line_items")
      .select("id, category_id, payment_account_id, name, default_amount, is_income, frequency, anchor_date, anchor_month, wave_type, one_time_date, recurrence, ripple_type, plan_type, preferred_payment_date, payment_due_date")
      .eq("user_id", userId)
      .order("sort_order", { ascending: true })
      .returns<LineItemRow[]>(),
  ]);

  if (budgetSettingsResult.error) throw budgetSettingsResult.error;
  if (paymentAccountsResult.error) throw paymentAccountsResult.error;
  if (categoriesResult.error) throw categoriesResult.error;
  if (lineItemsResult.error) throw lineItemsResult.error;

  return buildSettingsFromSupabase({
    budgetSettings: budgetSettingsResult.data,
    paymentAccounts: paymentAccountsResult.data ?? [],
    categories: categoriesResult.data ?? [],
    lineItems: lineItemsResult.data ?? [],
  });
}

async function loadSettings(): Promise<AppSettings | null> {
  const user = await getUser();
  if (!user) return null;
  return loadSettingsForUser(user.id);
}

async function saveSettings(settings: AppSettings): Promise<AppSettings> {
  const user = await getUser();
  if (!user) throw new Error("Not authenticated");

  const supabase = createClient();
  const { data: existingBudgetSettings, error: existingSettingsError } = await supabase
    .from("budget_settings")
    .select("checking_balance")
    .eq("user_id", user.id)
    .maybeSingle<BudgetSettingsRow>();

  if (existingSettingsError) throwSupabaseError(existingSettingsError, "Could not inspect Budget settings");

  if (existingBudgetSettings?.checking_balance === null || existingBudgetSettings?.checking_balance === undefined) {
    const { error: settingsError } = await supabase
      .from("budget_settings")
      .upsert(
        {
          user_id: user.id,
          checking_balance: settings.checkingBalance,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );

    if (settingsError) throwSupabaseError(settingsError, "Could not save Budget settings");
  }

  const desiredAccounts = [
    {
      user_id: user.id,
      account_key: "checking",
      kind: "checking",
      label: "Checking",
      current_balance: settings.checkingBalance,
      current_balance_updated_at: null,
      sort_order: 0,
    },
    ...settings.creditCards.map((card, index) => ({
      user_id: user.id,
      account_key: card.id,
      kind: "credit",
      label: card.label,
      current_balance: card.currentBalance ?? 0,
      current_balance_updated_at: card.currentBalanceUpdatedAt ?? null,
      statement_closing_day: card.statementClosingDay ?? null,
      payment_due_day: card.paymentDueDay ?? null,
      preferred_payment_timing: card.preferredPaymentTiming ?? null,
      preferred_payment_days_before_due: card.preferredPaymentDaysBeforeDue ?? null,
      preferred_payment_day: card.preferredPaymentDay ?? null,
      sort_order: index + 1,
    })),
  ];

  const { error: accountsError } = await supabase
    .from("payment_accounts")
    .upsert(desiredAccounts, { onConflict: "user_id,account_key" });

  if (accountsError) throwSupabaseError(accountsError, "Could not save Fleet accounts. Apply db/0014_fleet_card_balance_anchor.sql if this mentions current_balance_updated_at");

  const desiredCategoryNames = Array.from(
    new Set([...settings.categories, ...settings.lineItems.map((item) => item.category)].filter(Boolean)),
  );
  const desiredCategories = desiredCategoryNames.map((name, index) => ({
    user_id: user.id,
    name,
    sort_order: index,
  }));

  if (desiredCategories.length > 0) {
    const { error: categoriesError } = await supabase
      .from("categories")
      .upsert(desiredCategories, { onConflict: "user_id,name" });

    if (categoriesError) throwSupabaseError(categoriesError, "Could not save Charts");
  }

  const [accountsResult, categoriesResult, existingLineItemsResult] = await Promise.all([
    supabase
      .from("payment_accounts")
      .select(PAYMENT_ACCOUNT_COLUMNS)
      .eq("user_id", user.id)
      .returns<PaymentAccountRow[]>(),
    supabase
      .from("categories")
      .select("id, name")
      .eq("user_id", user.id)
      .returns<CategoryRow[]>(),
    supabase
      .from("line_items")
      .select("id")
      .eq("user_id", user.id)
      .returns<Pick<LineItemRow, "id">[]>(),
  ]);

  if (accountsResult.error) throwSupabaseError(accountsResult.error, "Could not reload Fleet accounts. Apply db/0014_fleet_card_balance_anchor.sql if this mentions current_balance_updated_at");
  if (categoriesResult.error) throwSupabaseError(categoriesResult.error, "Could not reload Charts");
  if (existingLineItemsResult.error) throwSupabaseError(existingLineItemsResult.error, "Could not inspect Ripples and Waves");

  const accountsByKey = new Map((accountsResult.data ?? []).map((account) => [account.account_key, account]));
  const categoriesByName = new Map((categoriesResult.data ?? []).map((category) => [category.name, category]));
  const checkingAccount = accountsByKey.get("checking");

  if (!checkingAccount) {
    throw new Error("Checking account could not be found.");
  }

  const incomingSupabaseIds = new Set(settings.lineItems.map((item) => item.id).filter(isUuid));
  const lineItemIdsToDelete = (existingLineItemsResult.data ?? [])
    .map((item) => item.id)
    .filter((id) => !incomingSupabaseIds.has(id));

  if (lineItemIdsToDelete.length > 0) {
    const { error: deleteLineItemsError } = await supabase
      .from("line_items")
      .delete()
      .eq("user_id", user.id)
      .in("id", lineItemIdsToDelete);

    if (deleteLineItemsError) throwSupabaseError(deleteLineItemsError, "Could not remove deleted Ripples or Waves");
  }

  const existingRows = [];
  const newRows = [];

  for (const [index, item] of settings.lineItems.entries()) {
    const category = categoriesByName.get(item.category);
    const paymentAccount = accountsByKey.get(item.paymentMethod) ?? checkingAccount;

    if (!category) continue;

    const row = {
      user_id: user.id,
      category_id: category.id,
      payment_account_id: paymentAccount.id,
      name: item.name,
      default_amount: item.defaultAmount,
      is_income: item.isIncome,
      frequency: item.frequency,
      anchor_date: item.anchorDate ?? null,
      anchor_month: item.anchorMonth ?? null,
      wave_type: item.waveType ?? "recurring",
      one_time_date: item.waveType === "oneTime" ? item.oneTimeDate ?? null : null,
      recurrence: item.waveType === "oneTime" ? null : item.recurrence ?? null,
      ripple_type: item.isIncome ? null : item.rippleType ?? null,
      plan_type: item.isIncome ? null : item.planType ?? null,
      preferred_payment_date: item.preferredPaymentDate?.slice(0, 10) ?? null,
      payment_due_date: item.paymentDueDate?.slice(0, 10) ?? null,
      sort_order: index,
      updated_at: new Date().toISOString(),
    };

    if (isUuid(item.id)) {
      existingRows.push({ ...row, id: item.id });
    } else {
      newRows.push(row);
    }
  }

  if (existingRows.length > 0) {
    const { error: upsertLineItemsError } = await supabase
      .from("line_items")
      .upsert(existingRows, { onConflict: "id" });

    if (upsertLineItemsError) throwSupabaseError(upsertLineItemsError, "Could not save Ripples or Waves. Apply db/0013_ripple_plan_type.sql if this mentions plan_type");
  }

  if (newRows.length > 0) {
    const { error: insertLineItemsError } = await supabase
      .from("line_items")
      .insert(newRows);

    if (insertLineItemsError) throwSupabaseError(insertLineItemsError, "Could not add Ripple or Wave. Apply db/0013_ripple_plan_type.sql if this mentions plan_type");
  }

  const desiredAccountKeys = new Set(desiredAccounts.map((account) => account.account_key));
  const removedCreditAccountIds = (accountsResult.data ?? [])
    .filter((account) => account.kind === "credit" && !desiredAccountKeys.has(account.account_key))
    .map((account) => account.id);

  if (removedCreditAccountIds.length > 0) {
    const { error: deleteAccountsError } = await supabase
      .from("payment_accounts")
      .delete()
      .eq("user_id", user.id)
      .in("id", removedCreditAccountIds);

    if (deleteAccountsError) throwSupabaseError(deleteAccountsError, "Could not remove deleted Fleet card");
  }

  const desiredCategoryNameSet = new Set(desiredCategoryNames);
  const removedCategoryIds = (categoriesResult.data ?? [])
    .filter((category) => !desiredCategoryNameSet.has(category.name))
    .map((category) => category.id);

  if (removedCategoryIds.length > 0) {
    const { error: deleteCategoriesError } = await supabase
      .from("categories")
      .delete()
      .eq("user_id", user.id)
      .in("id", removedCategoryIds);

    if (deleteCategoriesError) throwSupabaseError(deleteCategoriesError, "Could not remove deleted Chart");
  }

  const savedSettings = await loadSettingsForUser(user.id);
  if (!savedSettings) throw new Error("Saved settings could not be loaded.");

  return savedSettings;
}

async function getMonthlyAmounts(monthKey: string): Promise<Record<string, Record<number, number>>> {
  const user = await getUser();
  if (!user) return {};

  const supabase = createClient();
  const { data, error } = await supabase
    .from("monthly_amounts")
    .select("line_item_id, week_index, amount")
    .eq("user_id", user.id)
    .eq("month_key", monthKey)
    .returns<MonthlyAmountRow[]>();

  if (error) throw error;

  return (data ?? []).reduce<Record<string, Record<number, number>>>((acc, row) => {
    acc[row.line_item_id] = acc[row.line_item_id] ?? {};
    acc[row.line_item_id][row.week_index] = Number(row.amount);
    return acc;
  }, {});
}

async function saveMonthlyAmounts(monthKey: string, amounts: Record<string, Record<number, number>>) {
  const user = await getUser();
  if (!user) throw new Error("Not authenticated");

  const invalidLineItemIds = Object.keys(amounts).filter((lineItemId) => !isUuid(lineItemId));
  if (invalidLineItemIds.length > 0) {
    throw new Error(`Cannot save Dock amounts for non-canonical line item IDs: ${invalidLineItemIds.join(", ")}`);
  }

  const rows = Object.entries(amounts).flatMap(([lineItemId, byWeek]) => {
    return Object.entries(byWeek).map(([weekIndex, amount]) => ({
      user_id: user.id,
      line_item_id: lineItemId,
      month_key: monthKey,
      week_index: Number(weekIndex),
      amount,
      updated_at: new Date().toISOString(),
    }));
  });

  if (rows.length === 0) return;

  const supabase = createClient();
  const { error: insertError } = await supabase
    .from("monthly_amounts")
    .upsert(rows, { onConflict: "user_id,line_item_id,month_key,week_index" });

  if (insertError) throw insertError;
}

async function clearMonthlyAmounts(monthKey: string) {
  const user = await getUser();
  if (!user) throw new Error("Not authenticated");

  const supabase = createClient();
  const { error } = await supabase
    .from("monthly_amounts")
    .delete()
    .eq("user_id", user.id)
    .eq("month_key", monthKey);

  if (error) throw error;
}

async function clearMonthlyAmountsForItem(monthKey: string, itemId: string) {
  const user = await getUser();
  if (!user) throw new Error("Not authenticated");
  if (!isUuid(itemId)) return;

  const supabase = createClient();
  const { error } = await supabase
    .from("monthly_amounts")
    .delete()
    .eq("user_id", user.id)
    .eq("month_key", monthKey)
    .eq("line_item_id", itemId);

  if (error) throw error;
}

async function getMonthBalances(): Promise<Record<string, number>> {
  const user = await getUser();
  if (!user) return {};

  const supabase = createClient();
  const { data, error } = await supabase
    .from("month_balances")
    .select("month_key, starting_balance")
    .eq("user_id", user.id)
    .returns<MonthBalanceRow[]>();

  if (error) throw error;

  return Object.fromEntries(
    (data ?? []).map((row) => [row.month_key, Number(row.starting_balance)]),
  );
}

async function getAnchorOverride(): Promise<number | null> {
  const user = await getUser();
  if (!user) return null;

  const supabase = createClient();
  const { data, error } = await supabase
    .from("budget_settings")
    .select("checking_balance")
    .eq("user_id", user.id)
    .maybeSingle<BudgetSettingsRow>();

  if (error) throw error;

  if (data?.checking_balance === null || data?.checking_balance === undefined) {
    return null;
  }

  const checkingBalance = Number(data.checking_balance);
  return checkingBalance === 0 ? null : checkingBalance;
}

async function getCheckingAnchor(): Promise<{ balance: number | null; updatedAt?: string }> {
  const user = await getUser();
  if (!user) return { balance: null };

  const supabase = createClient();
  const { data, error } = await supabase
    .from("budget_settings")
    .select("checking_balance, updated_at")
    .eq("user_id", user.id)
    .maybeSingle<BudgetSettingsRow>();

  if (error) throw error;

  const balance = data?.checking_balance === null || data?.checking_balance === undefined
    ? null
    : Number(data.checking_balance);
  return { balance: balance === 0 ? null : balance, updatedAt: data?.updated_at ?? undefined };
}

async function saveAnchorOverride(override: number | null): Promise<number | null> {
  const user = await getUser();
  if (!user) throw new Error("Not authenticated");

  const supabase = createClient();
  const { error } = await supabase
    .from("budget_settings")
    .upsert(
      {
        user_id: user.id,
        checking_balance: override ?? 0,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

  if (error) throw error;

  return override;
}

async function saveCheckingAnchor(override: number | null): Promise<{ balance: number | null; updatedAt: string }> {
  const user = await getUser();
  if (!user) throw new Error("Not authenticated");

  const updatedAt = new Date().toISOString();
  const supabase = createClient();
  const { error } = await supabase
    .from("budget_settings")
    .upsert(
      {
        user_id: user.id,
        checking_balance: override ?? 0,
        updated_at: updatedAt,
      },
      { onConflict: "user_id" },
    );

  if (error) throw error;

  return { balance: override, updatedAt };
}

async function saveMonthBalance(monthKey: string, balance: number): Promise<Record<string, number>> {
  const user = await getUser();
  if (!user) throw new Error("Not authenticated");

  const supabase = createClient();
  const { error } = await supabase
    .from("month_balances")
    .upsert(
      {
        user_id: user.id,
        month_key: monthKey,
        starting_balance: balance,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,month_key" },
    );

  if (error) throw error;

  return getMonthBalances();
}

async function getClosedMonths(): Promise<Set<string>> {
  const user = await getUser();
  if (!user) return new Set();

  const supabase = createClient();
  const { data, error } = await supabase
    .from("closed_months")
    .select("month_key")
    .eq("user_id", user.id)
    .is("reopened_at", null)
    .returns<ClosedMonthRow[]>();

  if (error) throw error;

  return new Set((data ?? []).map((row) => row.month_key));
}

async function closeMonth(monthKey: string, endingBalance: number): Promise<Set<string>> {
  const user = await getUser();
  if (!user) throw new Error("Not authenticated");

  await saveMonthBalance(monthKey, endingBalance);

  const supabase = createClient();
  const { error } = await supabase
    .from("closed_months")
    .upsert(
      {
        user_id: user.id,
        month_key: monthKey,
        ending_balance: endingBalance,
        closed_at: new Date().toISOString(),
        reopened_at: null,
      },
      { onConflict: "user_id,month_key" },
    );

  if (error) throw error;

  return getClosedMonths();
}

async function reopenMonth(monthKey: string): Promise<Set<string>> {
  const user = await getUser();
  if (!user) throw new Error("Not authenticated");

  const supabase = createClient();
  const { error } = await supabase
    .from("closed_months")
    .update({ reopened_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("month_key", monthKey);

  if (error) throw error;

  return getClosedMonths();
}

async function getPaymentAccounts(userId: string): Promise<PaymentAccountRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
      .from("payment_accounts")
      .select(PAYMENT_ACCOUNT_COLUMNS)
    .eq("user_id", userId)
    .returns<PaymentAccountRow[]>();

  if (error) throw error;
  return data ?? [];
}

async function getClosedWeeks(monthKey: string): Promise<Set<string>> {
  const user = await getUser();
  if (!user) return new Set();

  const supabase = createClient();
  const [accounts, closedWeeksResult] = await Promise.all([
    getPaymentAccounts(user.id),
    supabase
      .from("closed_weeks")
      .select("payment_account_id, week_index")
      .eq("user_id", user.id)
      .eq("month_key", monthKey)
      .returns<ClosedWeekRow[]>(),
  ]);

  if (closedWeeksResult.error) throw closedWeeksResult.error;

  const accountKeysById = new Map(accounts.map((account) => [account.id, account.account_key]));
  return new Set(
    (closedWeeksResult.data ?? []).map((row) => (
      closedWeekKey(monthKey, accountKeysById.get(row.payment_account_id) ?? row.payment_account_id, row.week_index)
    )),
  );
}

async function getCCCharges(): Promise<CCCharge[]> {
  const user = await getUser();
  if (!user) return [];

  const supabase = createClient();
  const [accounts, chargesResult] = await Promise.all([
    getPaymentAccounts(user.id),
    supabase
      .from("cc_charges")
      .select("line_item_id, payment_account_id, item_name, card_label, amount, week_label, date_moved")
      .eq("user_id", user.id)
      .order("date_moved", { ascending: false })
      .returns<CCChargeRow[]>(),
  ]);

  if (chargesResult.error) throw chargesResult.error;

  const accountKeysById = new Map(accounts.map((account) => [account.id, account.account_key]));
  return (chargesResult.data ?? []).map((charge) => ({
    itemId: charge.line_item_id ?? "",
    itemName: charge.item_name,
    card: accountKeysById.get(charge.payment_account_id) ?? charge.payment_account_id,
    cardLabel: charge.card_label,
    amount: Number(charge.amount),
    weekLabel: charge.week_label,
    dateMoved: charge.date_moved,
  }));
}

async function getSpendLogs(monthKey: string): Promise<SpendLogEntry[]> {
  const user = await getUser();
  if (!user) return [];

  const supabase = createClient();
  const [accounts, spendLogsResult] = await Promise.all([
    getPaymentAccounts(user.id),
    supabase
      .from("spend_logs")
      .select("id, user_id, month_key, week_index, ripple_id, payment_account_id, amount, spend_date, note, created_at, updated_at")
      .eq("user_id", user.id)
      .eq("month_key", monthKey)
      .order("spend_date", { ascending: false })
      .order("created_at", { ascending: false })
      .returns<SpendLogRow[]>(),
  ]);

  if (spendLogsResult.error) throw spendLogsResult.error;

  const accountKeysById = new Map(accounts.map((account) => [account.id, account.account_key]));
  return (spendLogsResult.data ?? []).map((row) => fromSpendLogRow(row, accountKeysById));
}

async function getDockItemStates(monthKey: string): Promise<DockItemState[]> {
  const user = await getUser();
  if (!user) return [];

  const supabase = createClient();
  const { data, error } = await supabase
    .from("dock_item_states")
    .select("id, user_id, month_key, week_index, item_id, item_kind, behavior_type, status, status_updated_at, planned_amount, actual_amount, pending_until, cleared_at, note, created_at, updated_at")
    .eq("user_id", user.id)
    .eq("month_key", monthKey)
    .returns<DockItemStateRow[]>();

  if (error) throw error;
  return (data ?? []).map(fromDockItemStateRow);
}

async function saveDockItemState(state: DockItemState): Promise<DockItemState> {
  const user = await getUser();
  if (!user) throw new Error("Not authenticated");

  const now = new Date().toISOString();
  const supabase = createClient();
  const { data, error } = await supabase
    .from("dock_item_states")
    .upsert(
      {
        id: isUuid(state.id ?? "") ? state.id : crypto.randomUUID(),
        user_id: user.id,
        month_key: state.monthKey,
        week_index: state.weekIndex,
        item_id: state.itemId,
        item_kind: state.itemKind,
        behavior_type: state.behaviorType,
        status: state.status,
        status_updated_at: state.statusUpdatedAt ?? now,
        planned_amount: state.plannedAmount ?? null,
        actual_amount: state.actualAmount ?? null,
        pending_until: state.pendingUntil?.slice(0, 10) ?? null,
        cleared_at: state.clearedAt ?? null,
        note: state.note?.trim() || null,
        created_at: state.createdAt ?? now,
        updated_at: now,
      },
      { onConflict: "user_id,month_key,week_index,item_id,item_kind" },
    )
    .select("id, user_id, month_key, week_index, item_id, item_kind, behavior_type, status, status_updated_at, planned_amount, actual_amount, pending_until, cleared_at, note, created_at, updated_at")
    .single<DockItemStateRow>();

  if (error) throw error;
  return fromDockItemStateRow(data);
}

async function deleteDockItemState(
  monthKey: string,
  itemId: string,
  itemKind: DockItemKind,
  weekIndex: number,
) {
  const user = await getUser();
  if (!user) throw new Error("Not authenticated");

  const supabase = createClient();
  const { error } = await supabase
    .from("dock_item_states")
    .delete()
    .eq("user_id", user.id)
    .eq("month_key", monthKey)
    .eq("week_index", weekIndex)
    .eq("item_id", itemId)
    .eq("item_kind", itemKind);

  if (error) throw error;
}

async function saveSpendLog(entry: SpendLogEntry): Promise<SpendLogEntry> {
  const user = await getUser();
  if (!user) throw new Error("Not authenticated");

  const accounts = await getPaymentAccounts(user.id);
  const accountsByKey = new Map(accounts.map((account) => [account.account_key, account]));
  const paymentAccount = accountsByKey.get(entry.paymentMethod);
  if (!paymentAccount) throw new Error("Payment account could not be found.");

  const now = new Date().toISOString();
  const id = isUuid(entry.id) ? entry.id : crypto.randomUUID();
  const supabase = createClient();
  const { data, error } = await supabase
    .from("spend_logs")
    .upsert(
      {
        id,
        user_id: user.id,
        month_key: entry.monthKey,
        week_index: entry.weekIndex,
        ripple_id: isUuid(entry.rippleId) ? entry.rippleId : null,
        payment_account_id: paymentAccount.id,
        amount: entry.amount,
        spend_date: entry.date.slice(0, 10),
        note: entry.note?.trim() || null,
        created_at: entry.createdAt || now,
        updated_at: now,
      },
      { onConflict: "id" },
    )
    .select("id, user_id, month_key, week_index, ripple_id, payment_account_id, amount, spend_date, note, created_at, updated_at")
    .single<SpendLogRow>();

  if (error) throw error;

  const accountKeysById = new Map(accounts.map((account) => [account.id, account.account_key]));
  return fromSpendLogRow(data, accountKeysById);
}

async function deleteSpendLog(monthKey: string, entryId: string) {
  const user = await getUser();
  if (!user) throw new Error("Not authenticated");
  if (!isUuid(entryId)) return;

  const supabase = createClient();
  const { error } = await supabase
    .from("spend_logs")
    .delete()
    .eq("user_id", user.id)
    .eq("month_key", monthKey)
    .eq("id", entryId);

  if (error) throw error;
}

async function addCCCharges(charges: CCCharge[]) {
  if (charges.length === 0) return;

  const user = await getUser();
  if (!user) throw new Error("Not authenticated");

  const accounts = await getPaymentAccounts(user.id);
  const accountsByKey = new Map(accounts.map((account) => [account.account_key, account]));

  const rows = charges.flatMap((charge) => {
    const paymentAccount = accountsByKey.get(charge.card);
    if (!paymentAccount) return [];

    return {
      user_id: user.id,
      line_item_id: isUuid(charge.itemId) ? charge.itemId : null,
      payment_account_id: paymentAccount.id,
      item_name: charge.itemName,
      card_label: charge.cardLabel,
      amount: charge.amount,
      week_label: charge.weekLabel,
      date_moved: charge.dateMoved.slice(0, 10),
    };
  });

  if (rows.length === 0) return;

  const supabase = createClient();
  const { error } = await supabase
    .from("cc_charges")
    .insert(rows);

  if (error) throw error;
}

async function getBuoys(): Promise<Buoy[]> {
  const user = await getUser();
  if (!user) return [];

  const supabase = createClient();
  const { data, error } = await supabase
    .from("buoys")
    .select("id, name, current, goal, auto_save, auto_save_day, last_auto_save")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .returns<BuoyRow[]>();

  if (error) throw error;

  return (data ?? []).map(fromBuoyRow);
}

async function saveBuoy(buoy: Buoy): Promise<Buoy> {
  const user = await getUser();
  if (!user) throw new Error("Not authenticated");

  const supabase = createClient();
  const { data, error } = await supabase
    .from("buoys")
    .upsert(
      {
        user_id: user.id,
        id: isUuid(buoy.id) ? buoy.id : crypto.randomUUID(),
        name: buoy.name,
        current: buoy.current,
        goal: buoy.goal,
        auto_save: buoy.autoSave ?? null,
        auto_save_day: buoy.autoSaveDay ?? null,
        last_auto_save: toLastAutoSaveDate(buoy.lastAutoSave),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    )
    .select("id, name, current, goal, auto_save, auto_save_day, last_auto_save")
    .single<BuoyRow>();

  if (error) throw error;
  return fromBuoyRow(data);
}

async function deleteBuoy(id: string) {
  const user = await getUser();
  if (!user) throw new Error("Not authenticated");

  const supabase = createClient();
  const { error } = await supabase
    .from("buoys")
    .delete()
    .eq("user_id", user.id)
    .eq("id", id);

  if (error) throw error;
}

async function closeWeek({
  monthKey,
  cardId,
  weekIndex,
  charges,
}: {
  monthKey: string;
  cardId: string;
  weekIndex: number;
  charges: CCCharge[];
}): Promise<Set<string>> {
  const user = await getUser();
  if (!user) throw new Error("Not authenticated");

  const accounts = await getPaymentAccounts(user.id);
  const paymentAccount = accounts.find((account) => account.account_key === cardId);
  if (!paymentAccount) throw new Error("Payment account could not be found.");

  await addCCCharges(charges);

  const supabase = createClient();
  const { error } = await supabase
    .from("closed_weeks")
    .upsert(
      {
        user_id: user.id,
        payment_account_id: paymentAccount.id,
        month_key: monthKey,
        week_index: weekIndex,
        closed_at: new Date().toISOString(),
      },
      { onConflict: "user_id,payment_account_id,month_key,week_index" },
    );

  if (error) throw error;

  return getClosedWeeks(monthKey);
}

export const supabaseBudgetRepo = {
  getUser,
  loadSettings,
  saveSettings,
  getMonthlyAmounts,
  saveMonthlyAmounts,
  clearMonthlyAmounts,
  clearMonthlyAmountsForItem,
  getMonthBalances,
  saveMonthBalance,
  getClosedMonths,
  closeMonth,
  reopenMonth,
  getAnchorOverride,
  getCheckingAnchor,
  saveAnchorOverride,
  saveCheckingAnchor,
  getClosedWeeks,
  closeWeek,
  getCCCharges,
  getDockItemStates,
  saveDockItemState,
  deleteDockItemState,
  getSpendLogs,
  saveSpendLog,
  deleteSpendLog,
  addCCCharges,
  getBuoys,
  saveBuoy,
  deleteBuoy,
};
