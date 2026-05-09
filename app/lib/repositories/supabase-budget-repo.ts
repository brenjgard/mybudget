"use client";

import { createClient } from "../supabase/client";
import type { CCCharge } from "../local-repo";
import type { Buoy } from "../local-repo";
import type { AppSettings, FrequencyType, LineItem, PaymentMethod } from "../types";

type User = {
  id: string;
};

type BudgetSettingsRow = {
  checking_balance: number | string | null;
};

type PaymentAccountRow = {
  id: string;
  account_key: string;
  kind: "checking" | "credit";
  label: string;
};

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

type BuoyRow = {
  id: string;
  name: string;
  current: number | string;
  goal: number | string;
  auto_save: number | string | null;
  auto_save_day: number | null;
  last_auto_save: string | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string) {
  return UUID_RE.test(value);
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
    })),
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
      .select("id, account_key, kind, label")
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
      .select("id, category_id, payment_account_id, name, default_amount, is_income, frequency, anchor_date, anchor_month")
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

  if (settingsError) throw settingsError;

  const desiredAccounts = [
    {
      user_id: user.id,
      account_key: "checking",
      kind: "checking",
      label: "Checking",
      sort_order: 0,
    },
    ...settings.creditCards.map((card, index) => ({
      user_id: user.id,
      account_key: card.id,
      kind: "credit",
      label: card.label,
      sort_order: index + 1,
    })),
  ];

  const { error: accountsError } = await supabase
    .from("payment_accounts")
    .upsert(desiredAccounts, { onConflict: "user_id,account_key" });

  if (accountsError) throw accountsError;

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

    if (categoriesError) throw categoriesError;
  }

  const [accountsResult, categoriesResult, existingLineItemsResult] = await Promise.all([
    supabase
      .from("payment_accounts")
      .select("id, account_key, kind, label")
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

  if (accountsResult.error) throw accountsResult.error;
  if (categoriesResult.error) throw categoriesResult.error;
  if (existingLineItemsResult.error) throw existingLineItemsResult.error;

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

    if (deleteLineItemsError) throw deleteLineItemsError;
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

    if (upsertLineItemsError) throw upsertLineItemsError;
  }

  if (newRows.length > 0) {
    const { error: insertLineItemsError } = await supabase
      .from("line_items")
      .insert(newRows);

    if (insertLineItemsError) throw insertLineItemsError;
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

    if (deleteAccountsError) throw deleteAccountsError;
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

    if (deleteCategoriesError) throw deleteCategoriesError;
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

  const supabase = createClient();
  const { error: deleteError } = await supabase
    .from("monthly_amounts")
    .delete()
    .eq("user_id", user.id)
    .eq("month_key", monthKey);

  if (deleteError) throw deleteError;

  const rows = Object.entries(amounts).flatMap(([lineItemId, byWeek]) => {
    if (!isUuid(lineItemId)) return [];

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

  const { error: insertError } = await supabase
    .from("monthly_amounts")
    .insert(rows);

  if (insertError) throw insertError;
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

async function getPaymentAccounts(userId: string): Promise<PaymentAccountRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("payment_accounts")
    .select("id, account_key, kind, label")
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
  getMonthBalances,
  saveMonthBalance,
  getAnchorOverride,
  saveAnchorOverride,
  getClosedWeeks,
  closeWeek,
  getCCCharges,
  addCCCharges,
  getBuoys,
  saveBuoy,
  deleteBuoy,
};
