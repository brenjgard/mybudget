"use client";

import { createClient } from "../supabase/client";
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string) {
  return UUID_RE.test(value);
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

export const supabaseBudgetRepo = {
  getUser,
  loadSettings,
  saveSettings,
};
