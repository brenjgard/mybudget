"use client";

import { localRepo } from "./local-repo";
import { createClient } from "./supabase/client";
import type { AppSettings, FrequencyType, LineItem, PaymentMethod } from "./types";

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

type ExistingCategoryRow = Pick<CategoryRow, "name">;

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

type InitialSupabaseSeedResult = {
  budgetSettingsInserted: boolean;
  paymentAccountsInserted: number;
  categoriesInserted: number;
  lineItemsInserted: number;
};

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

  const categoryNamesById = new Map(
    categories.map((category) => [category.id, category.name]),
  );
  const accountKeysById = new Map(
    paymentAccounts.map((account) => [account.id, account.account_key]),
  );

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

export async function loadSettingsWithSupabaseFallback(): Promise<AppSettings | null> {
  const localSettings = localRepo.loadSettings();

  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return localSettings;

    const [budgetSettingsResult, paymentAccountsResult, categoriesResult, lineItemsResult] = await Promise.all([
      supabase
        .from("budget_settings")
        .select("checking_balance")
        .eq("user_id", user.id)
        .maybeSingle<BudgetSettingsRow>(),
      supabase
        .from("payment_accounts")
        .select("id, account_key, kind, label")
        .eq("user_id", user.id)
        .order("sort_order", { ascending: true })
        .returns<PaymentAccountRow[]>(),
      supabase
        .from("categories")
        .select("id, name")
        .eq("user_id", user.id)
        .order("sort_order", { ascending: true })
        .returns<CategoryRow[]>(),
      supabase
        .from("line_items")
        .select("id, category_id, payment_account_id, name, default_amount, is_income, frequency, anchor_date, anchor_month")
        .eq("user_id", user.id)
        .order("sort_order", { ascending: true })
        .returns<LineItemRow[]>(),
    ]);

    const { data: budgetSettings, error: budgetSettingsError } = budgetSettingsResult;
    const { data: paymentAccounts, error: paymentAccountsError } = paymentAccountsResult;
    const { data: categories, error: categoriesError } = categoriesResult;
    const { data: lineItems, error: lineItemsError } = lineItemsResult;

    if (!localSettings) {
      if (budgetSettingsError || paymentAccountsError || categoriesError || lineItemsError) {
        return null;
      }

      return buildSettingsFromSupabase({
        budgetSettings,
        paymentAccounts: paymentAccounts ?? [],
        categories: categories ?? [],
        lineItems: lineItems ?? [],
      });
    }

    let settings = localSettings;

    if (!budgetSettingsError && budgetSettings?.checking_balance !== null && budgetSettings?.checking_balance !== undefined) {
      settings = {
        ...settings,
        checkingBalance: Number(budgetSettings.checking_balance),
      };
    }

    if (!paymentAccountsError && paymentAccounts && paymentAccounts.length > 0) {
      settings = {
        ...settings,
        creditCards: paymentAccounts
          .filter((account) => account.kind === "credit")
          .map((account) => ({
            id: account.account_key as PaymentMethod,
            label: account.label,
          })),
      };
    }

    if (!categoriesError && categories && categories.length > 0) {
      settings = {
        ...settings,
        categories: categories.map((category) => category.name),
      };
    }

    return settings;
  } catch {
    return localSettings;
  }
}

export async function saveLocalSettingsToSupabase(): Promise<InitialSupabaseSeedResult> {
  const localSettings = localRepo.loadSettings();

  if (!localSettings) {
    return {
      budgetSettingsInserted: false,
      paymentAccountsInserted: 0,
      categoriesInserted: 0,
      lineItemsInserted: 0,
    };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      budgetSettingsInserted: false,
      paymentAccountsInserted: 0,
      categoriesInserted: 0,
      lineItemsInserted: 0,
    };
  }

  const [budgetSettingsResult, existingAccountsResult, existingCategoriesResult] = await Promise.all([
    supabase
      .from("budget_settings")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle<{ user_id: string }>(),
    supabase
      .from("payment_accounts")
      .select("account_key")
      .eq("user_id", user.id)
      .returns<Pick<PaymentAccountRow, "account_key">[]>(),
    supabase
      .from("categories")
      .select("name")
      .eq("user_id", user.id)
      .returns<ExistingCategoryRow[]>(),
  ]);

  if (budgetSettingsResult.error) throw budgetSettingsResult.error;
  if (existingAccountsResult.error) throw existingAccountsResult.error;
  if (existingCategoriesResult.error) throw existingCategoriesResult.error;

  let budgetSettingsInserted = false;

  if (!budgetSettingsResult.data) {
    const { error } = await supabase
      .from("budget_settings")
      .insert({
        user_id: user.id,
        checking_balance: localSettings.checkingBalance,
      });

    if (error) throw error;
    budgetSettingsInserted = true;
  }

  const existingAccountKeys = new Set(
    (existingAccountsResult.data ?? []).map((account) => account.account_key),
  );
  const paymentAccounts = [
    {
      user_id: user.id,
      account_key: "checking",
      kind: "checking",
      label: "Checking",
      sort_order: 0,
    },
    ...localSettings.creditCards.map((card, index) => ({
      user_id: user.id,
      account_key: card.id,
      kind: "credit",
      label: card.label,
      sort_order: index + 1,
    })),
  ].filter((account) => !existingAccountKeys.has(account.account_key));

  if (paymentAccounts.length > 0) {
    const { error } = await supabase
      .from("payment_accounts")
      .insert(paymentAccounts);

    if (error) throw error;
  }

  const existingCategoryNames = new Set(
    (existingCategoriesResult.data ?? []).map((category) => category.name),
  );
  const categories = localSettings.categories
    .filter((category) => !existingCategoryNames.has(category))
    .map((category, index) => ({
      user_id: user.id,
      name: category,
      sort_order: index,
    }));

  if (categories.length > 0) {
    const { error } = await supabase
      .from("categories")
      .insert(categories);

    if (error) throw error;
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
      .select("category_id, payment_account_id, name, default_amount, is_income, frequency")
      .eq("user_id", user.id)
      .returns<Pick<LineItemRow, "category_id" | "payment_account_id" | "name" | "default_amount" | "is_income" | "frequency">[]>(),
  ]);

  if (accountsResult.error) throw accountsResult.error;
  if (categoriesResult.error) throw categoriesResult.error;
  if (existingLineItemsResult.error) throw existingLineItemsResult.error;

  const accountsByKey = new Map(
    (accountsResult.data ?? []).map((account) => [account.account_key, account]),
  );
  const categoriesByName = new Map(
    (categoriesResult.data ?? []).map((category) => [category.name, category]),
  );
  const existingLineItemKeys = new Set(
    (existingLineItemsResult.data ?? []).map((item) => (
      [
        item.category_id,
        item.payment_account_id,
        item.name,
        Number(item.default_amount),
        item.is_income,
        item.frequency,
      ].join("|")
    )),
  );

  const checkingAccount = accountsByKey.get("checking");
  const lineItems = localSettings.lineItems
    .map((item, index) => {
      const category = categoriesByName.get(item.category);
      const paymentAccount = accountsByKey.get(item.paymentMethod) ?? checkingAccount;

      if (!category || !paymentAccount) return null;

      const lineItemKey = [
        category.id,
        paymentAccount.id,
        item.name,
        item.defaultAmount,
        item.isIncome,
        item.frequency,
      ].join("|");

      if (existingLineItemKeys.has(lineItemKey)) return null;

      return {
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
      };
    })
    .filter((item) => item !== null);

  if (lineItems.length > 0) {
    const { error } = await supabase
      .from("line_items")
      .insert(lineItems);

    if (error) throw error;
  }

  return {
    budgetSettingsInserted,
    paymentAccountsInserted: paymentAccounts.length,
    categoriesInserted: categories.length,
    lineItemsInserted: lineItems.length,
  };
}
