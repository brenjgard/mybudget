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

export const budgetRepo = {
  loadSettings,
  saveSettings,
};
