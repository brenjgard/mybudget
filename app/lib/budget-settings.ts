"use client";

import { localBudgetRepo } from "./repositories/local-budget-repo";
import { supabaseBudgetRepo } from "./repositories/supabase-budget-repo";
import { budgetRepo } from "./repositories/budget-repo";
import type { AppSettings } from "./types";

type InitialSupabaseSeedResult = {
  budgetSettingsInserted: boolean;
  paymentAccountsInserted: number;
  categoriesInserted: number;
  lineItemsInserted: number;
};

export async function loadSettingsWithSupabaseFallback(): Promise<AppSettings | null> {
  return budgetRepo.loadSettings();
}

export async function saveSettings(settings: AppSettings): Promise<AppSettings> {
  return budgetRepo.saveSettings(settings);
}

export async function saveLocalSettingsToSupabase(): Promise<InitialSupabaseSeedResult> {
  const localSettings = localBudgetRepo.loadSettings();

  if (!localSettings) {
    return {
      budgetSettingsInserted: false,
      paymentAccountsInserted: 0,
      categoriesInserted: 0,
      lineItemsInserted: 0,
    };
  }

  const savedSettings = await supabaseBudgetRepo.saveSettings(localSettings);

  return {
    budgetSettingsInserted: true,
    paymentAccountsInserted: savedSettings.creditCards.length + 1,
    categoriesInserted: savedSettings.categories.length,
    lineItemsInserted: savedSettings.lineItems.length,
  };
}
