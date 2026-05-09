"use client";

import { localBudgetRepo } from "./local-budget-repo";
import { supabaseBudgetRepo } from "./supabase-budget-repo";
import type { AppSettings } from "../types";

async function loadSettings(): Promise<AppSettings | null> {
  try {
    const supabaseSettings = await supabaseBudgetRepo.loadSettings();
    if (supabaseSettings) return supabaseSettings;
  } catch {
    // Fall through to local settings if Supabase is unavailable.
  }

  return localBudgetRepo.loadSettings();
}

async function saveSettings(settings: AppSettings): Promise<AppSettings> {
  try {
    const user = await supabaseBudgetRepo.getUser();
    if (user) {
      return await supabaseBudgetRepo.saveSettings(settings);
    }
  } catch {
    // Fall through to local persistence if auth/Supabase is unavailable.
  }

  return localBudgetRepo.saveSettings(settings);
}

async function getMonthlyAmounts(monthKey: string): Promise<Record<string, Record<number, number>>> {
  try {
    const user = await supabaseBudgetRepo.getUser();
    if (user) {
      const supabaseAmounts = await supabaseBudgetRepo.getMonthlyAmounts(monthKey);
      if (Object.keys(supabaseAmounts).length > 0) return supabaseAmounts;

      const localAmounts = localBudgetRepo.getMonthlyAmounts(monthKey);
      if (Object.keys(localAmounts).length > 0) {
        await supabaseBudgetRepo.saveMonthlyAmounts(monthKey, localAmounts);
        return localAmounts;
      }

      return supabaseAmounts;
    }
  } catch {
    // Fall through to local persistence if auth/Supabase is unavailable.
  }

  return localBudgetRepo.getMonthlyAmounts(monthKey);
}

async function saveMonthlyAmounts(monthKey: string, amounts: Record<string, Record<number, number>>) {
  try {
    const user = await supabaseBudgetRepo.getUser();
    if (user) {
      await supabaseBudgetRepo.saveMonthlyAmounts(monthKey, amounts);
      return;
    }
  } catch {
    // Fall through to local persistence if auth/Supabase is unavailable.
  }

  localBudgetRepo.saveMonthlyAmounts(monthKey, amounts);
}

async function getMonthBalances(): Promise<Record<string, number>> {
  try {
    const user = await supabaseBudgetRepo.getUser();
    if (user) {
      const supabaseBalances = await supabaseBudgetRepo.getMonthBalances();
      if (Object.keys(supabaseBalances).length > 0) return supabaseBalances;

      const localBalances = localBudgetRepo.getMonthBalances();
      for (const [monthKey, balance] of Object.entries(localBalances)) {
        await supabaseBudgetRepo.saveMonthBalance(monthKey, balance);
      }

      return localBalances;
    }
  } catch {
    // Fall through to local persistence if auth/Supabase is unavailable.
  }

  return localBudgetRepo.getMonthBalances();
}

async function saveMonthBalance(monthKey: string, balance: number): Promise<Record<string, number>> {
  try {
    const user = await supabaseBudgetRepo.getUser();
    if (user) {
      return await supabaseBudgetRepo.saveMonthBalance(monthKey, balance);
    }
  } catch {
    // Fall through to local persistence if auth/Supabase is unavailable.
  }

  return localBudgetRepo.saveMonthBalance(monthKey, balance);
}

export const budgetRepo = {
  loadSettings,
  saveSettings,
  getMonthlyAmounts,
  saveMonthlyAmounts,
  getMonthBalances,
  saveMonthBalance,
};
