"use client";

import { localRepo } from "./local-repo";
import { createClient } from "./supabase/client";
import type { AppSettings } from "./types";

type BudgetSettingsRow = {
  checking_balance: number | string | null;
};

export async function loadSettingsWithSupabaseFallback(): Promise<AppSettings | null> {
  const localSettings = localRepo.loadSettings();

  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return localSettings;

    const { data, error } = await supabase
      .from("budget_settings")
      .select("checking_balance")
      .eq("user_id", user.id)
      .maybeSingle<BudgetSettingsRow>();

    if (error || !data || data.checking_balance === null || !localSettings) {
      return localSettings;
    }

    return {
      ...localSettings,
      checkingBalance: Number(data.checking_balance),
    };
  } catch {
    return localSettings;
  }
}
