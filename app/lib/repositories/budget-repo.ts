"use client";

import { localBudgetRepo } from "./local-budget-repo";
import { supabaseBudgetRepo } from "./supabase-budget-repo";
import type { CCCharge } from "../local-repo";
import type { Buoy } from "../local-repo";
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
      return await supabaseBudgetRepo.getMonthlyAmounts(monthKey);
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
      return await supabaseBudgetRepo.getMonthBalances();
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

async function getAnchorOverride(): Promise<number | null> {
  try {
    const user = await supabaseBudgetRepo.getUser();
    if (user) {
      return await supabaseBudgetRepo.getAnchorOverride();
    }
  } catch {
    // Fall through to local persistence if auth/Supabase is unavailable.
  }

  return localBudgetRepo.getAnchorOverride();
}

async function saveAnchorOverride(override: number | null): Promise<number | null> {
  try {
    const user = await supabaseBudgetRepo.getUser();
    if (user) {
      const savedOverride = await supabaseBudgetRepo.saveAnchorOverride(override);
      localBudgetRepo.saveAnchorOverride(savedOverride);
      return savedOverride;
    }
  } catch {
    // Fall through to local persistence if auth/Supabase is unavailable.
  }

  return localBudgetRepo.saveAnchorOverride(override);
}

async function getClosedWeeks(monthKey: string): Promise<Set<string>> {
  try {
    const user = await supabaseBudgetRepo.getUser();
    if (user) {
      const supabaseClosedWeeks = await supabaseBudgetRepo.getClosedWeeks(monthKey);
      if (supabaseClosedWeeks.size > 0) return supabaseClosedWeeks;

      return localBudgetRepo.getClosedWeeks(monthKey);
    }
  } catch {
    // Fall through to local persistence if auth/Supabase is unavailable.
  }

  return localBudgetRepo.getClosedWeeks(monthKey);
}

async function getCCCharges(): Promise<CCCharge[]> {
  try {
    const user = await supabaseBudgetRepo.getUser();
    if (user) {
      return await supabaseBudgetRepo.getCCCharges();
    }
  } catch {
    // Fall through to local persistence if auth/Supabase is unavailable.
  }

  return localBudgetRepo.getCCCharges();
}

async function addCCCharges(charges: CCCharge[]) {
  try {
    const user = await supabaseBudgetRepo.getUser();
    if (user) {
      await supabaseBudgetRepo.addCCCharges(charges);
      return;
    }
  } catch {
    // Fall through to local persistence if auth/Supabase is unavailable.
  }

  localBudgetRepo.addCCCharges(charges);
}

async function getBuoys(): Promise<Buoy[]> {
  try {
    const user = await supabaseBudgetRepo.getUser();
    if (user) {
      return await supabaseBudgetRepo.getBuoys();
    }
  } catch {
    // Fall through to local persistence if auth/Supabase is unavailable.
  }

  return localBudgetRepo.getBuoys();
}

async function saveBuoy(buoy: Buoy): Promise<Buoy> {
  try {
    const user = await supabaseBudgetRepo.getUser();
    if (user) {
      const savedBuoy = await supabaseBudgetRepo.saveBuoy(buoy);
      localBudgetRepo.saveBuoy(savedBuoy);
      return savedBuoy;
    }
  } catch {
    // Fall through to local persistence if auth/Supabase is unavailable.
  }

  return localBudgetRepo.saveBuoy(buoy);
}

async function deleteBuoy(id: string) {
  try {
    const user = await supabaseBudgetRepo.getUser();
    if (user) {
      await supabaseBudgetRepo.deleteBuoy(id);
      localBudgetRepo.deleteBuoy(id);
      return;
    }
  } catch {
    // Fall through to local persistence if auth/Supabase is unavailable.
  }

  localBudgetRepo.deleteBuoy(id);
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
  try {
    const user = await supabaseBudgetRepo.getUser();
    if (user) {
      return await supabaseBudgetRepo.closeWeek({ monthKey, cardId, weekIndex, charges });
    }
  } catch {
    // Fall through to local persistence if auth/Supabase is unavailable.
  }

  return localBudgetRepo.closeWeek({ monthKey, cardId, weekIndex, charges });
}

export const budgetRepo = {
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
