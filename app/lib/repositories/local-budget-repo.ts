"use client";

import { localRepo } from "../local-repo";
import type { AppSettings } from "../types";

export const localBudgetRepo = {
  loadSettings(): AppSettings | null {
    return localRepo.loadSettings();
  },

  saveSettings(settings: AppSettings): AppSettings {
    localRepo.saveSettings(settings);
    return settings;
  },

  getMonthlyAmounts(monthKey: string): Record<string, Record<number, number>> {
    return localRepo.loadAmounts(monthKey);
  },

  saveMonthlyAmounts(monthKey: string, amounts: Record<string, Record<number, number>>) {
    localRepo.saveAmounts(amounts, monthKey);
  },

  getMonthBalances(): Record<string, number> {
    return localRepo.loadMonthBalances();
  },

  saveMonthBalance(monthKey: string, balance: number): Record<string, number> {
    const balances = { ...localRepo.loadMonthBalances(), [monthKey]: balance };
    localRepo.saveMonthBalances(balances);
    return balances;
  },
};
