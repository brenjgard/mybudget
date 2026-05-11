"use client";

import { localRepo } from "../local-repo";
import type { CCCharge } from "../local-repo";
import type { Buoy } from "../local-repo";
import { scopedStorageKey, warnIfLegacyStorageExists } from "../local-storage-scope";
import type { AppSettings } from "../types";

const CLOSED_WEEKS_KEY = "harbor_closed_weeks";

function closedWeekKey(monthKey: string, cardId: string, weekIndex: number) {
  return `${monthKey}-${cardId}-${weekIndex}`;
}

function loadClosedWeekKeys(): string[] {
  try {
    warnIfLegacyStorageExists(CLOSED_WEEKS_KEY, "closed weeks");
    return JSON.parse(localStorage.getItem(scopedStorageKey(CLOSED_WEEKS_KEY)) ?? "[]") as string[];
  } catch {
    return [];
  }
}

function saveClosedWeekKeys(keys: string[]) {
  localStorage.setItem(scopedStorageKey(CLOSED_WEEKS_KEY), JSON.stringify(keys));
}

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

  getAnchorOverride(): number | null {
    const checkingBalance = localRepo.loadSettings()?.checkingBalance;
    return checkingBalance === undefined || checkingBalance === 0 ? null : checkingBalance;
  },

  saveAnchorOverride(override: number | null): number | null {
    const settings = localRepo.loadSettings();
    if (!settings) return override;

    localRepo.saveSettings({
      ...settings,
      checkingBalance: override ?? 0,
    });

    return override;
  },

  getClosedWeeks(monthKey: string): Set<string> {
    return new Set(loadClosedWeekKeys().filter((key) => key.startsWith(`${monthKey}-`)));
  },

  getCCCharges(): CCCharge[] {
    return localRepo.loadCCCharges();
  },

  addCCCharges(charges: CCCharge[]) {
    if (charges.length === 0) return;
    localRepo.saveCCCharges([...localRepo.loadCCCharges(), ...charges]);
  },

  getBuoys(): Buoy[] {
    return localRepo.loadBuoys();
  },

  saveBuoy(buoy: Buoy): Buoy {
    const existing = localRepo.loadBuoys();
    const updated = existing.some((item) => item.id === buoy.id)
      ? existing.map((item) => (item.id === buoy.id ? buoy : item))
      : [...existing, buoy];

    localRepo.saveBuoys(updated);
    return buoy;
  },

  deleteBuoy(id: string) {
    localRepo.saveBuoys(localRepo.loadBuoys().filter((buoy) => buoy.id !== id));
  },

  closeWeek({
    monthKey,
    cardId,
    weekIndex,
    charges,
  }: {
    monthKey: string;
    cardId: string;
    weekIndex: number;
    charges: CCCharge[];
  }): Set<string> {
    this.addCCCharges(charges);

    const keys = new Set(loadClosedWeekKeys());
    keys.add(closedWeekKey(monthKey, cardId, weekIndex));
    saveClosedWeekKeys([...keys]);

    return this.getClosedWeeks(monthKey);
  },
};
