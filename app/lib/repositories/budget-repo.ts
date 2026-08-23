"use client";

import { localBudgetRepo } from "./local-budget-repo";
import { supabaseBudgetRepo } from "./supabase-budget-repo";
import type { CCCharge } from "../local-repo";
import type { Buoy } from "../local-repo";
import type { AppSettings, DockItemState, SpendLogEntry } from "../types";

function readableError(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
  return String(error);
}

async function loadSettings(): Promise<AppSettings | null> {
  try {
    const user = await supabaseBudgetRepo.getUser();
    if (user) {
      const supabaseSettings = await supabaseBudgetRepo.loadSettings();
      if (supabaseSettings) {
        localBudgetRepo.saveSettings(supabaseSettings);
      }
      return supabaseSettings;
    }
  } catch (error) {
    console.error("[BudgetRepo] Supabase settings load failed", readableError(error));
    throw error;
  }

  return localBudgetRepo.loadSettings();
}

async function saveSettings(settings: AppSettings): Promise<AppSettings> {
  try {
    const user = await supabaseBudgetRepo.getUser();
    if (user) {
      const savedSettings = await supabaseBudgetRepo.saveSettings(settings);
      localBudgetRepo.saveSettings(savedSettings);
      return savedSettings;
    }
  } catch (error) {
    console.error("[BudgetRepo] Supabase settings save failed", readableError(error));
    throw error;
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
  let supabaseUserChecked = false;
  try {
    const user = await supabaseBudgetRepo.getUser();
    supabaseUserChecked = true;
    if (user) {
      await supabaseBudgetRepo.saveMonthlyAmounts(monthKey, amounts);
      return;
    }
  } catch (error) {
    console.error("[BudgetRepo] Supabase monthly amount save failed", { monthKey, error });
    if (supabaseUserChecked) throw error;
    // Fall through to local persistence if auth is unavailable.
  }

  localBudgetRepo.saveMonthlyAmounts(monthKey, amounts);
}

async function clearMonthlyAmounts(monthKey: string) {
  let supabaseUserChecked = false;
  try {
    const user = await supabaseBudgetRepo.getUser();
    supabaseUserChecked = true;
    if (user) {
      await supabaseBudgetRepo.clearMonthlyAmounts(monthKey);
      return;
    }
  } catch (error) {
    console.error("[BudgetRepo] Supabase monthly amount clear failed", { monthKey, error });
    if (supabaseUserChecked) throw error;
  }

  localBudgetRepo.saveMonthlyAmounts(monthKey, {});
}

async function clearMonthlyAmountsForItem(monthKey: string, itemId: string) {
  let supabaseUserChecked = false;
  try {
    const user = await supabaseBudgetRepo.getUser();
    supabaseUserChecked = true;
    if (user) {
      await supabaseBudgetRepo.clearMonthlyAmountsForItem(monthKey, itemId);
      return;
    }
  } catch (error) {
    console.error("[BudgetRepo] Supabase item monthly amount clear failed", { monthKey, itemId, error });
    if (supabaseUserChecked) throw error;
  }

  localBudgetRepo.clearMonthlyAmountsForItem(monthKey, itemId);
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

async function getClosedMonths(): Promise<Set<string>> {
  try {
    const user = await supabaseBudgetRepo.getUser();
    if (user) {
      return await supabaseBudgetRepo.getClosedMonths();
    }
  } catch {
    // Fall through to local persistence if auth/Supabase is unavailable.
  }

  return localBudgetRepo.getClosedMonths();
}

async function closeMonth(monthKey: string, endingBalance: number): Promise<Set<string>> {
  try {
    const user = await supabaseBudgetRepo.getUser();
    if (user) {
      return await supabaseBudgetRepo.closeMonth(monthKey, endingBalance);
    }
  } catch {
    // Fall through to local persistence if auth/Supabase is unavailable.
  }

  return localBudgetRepo.closeMonth(monthKey, endingBalance);
}

async function reopenMonth(monthKey: string): Promise<Set<string>> {
  try {
    const user = await supabaseBudgetRepo.getUser();
    if (user) {
      return await supabaseBudgetRepo.reopenMonth(monthKey);
    }
  } catch {
    // Fall through to local persistence if auth/Supabase is unavailable.
  }

  return localBudgetRepo.reopenMonth(monthKey);
}

async function getAnchorOverride(): Promise<number | null> {
  try {
    const user = await supabaseBudgetRepo.getUser();
    if (user) {
      const savedOverride = await supabaseBudgetRepo.getAnchorOverride();
      localBudgetRepo.saveAnchorOverride(savedOverride);
      return savedOverride;
    }
  } catch (error) {
    console.error("[BudgetRepo] Supabase anchor load failed", { error });
    throw error;
  }

  return localBudgetRepo.getAnchorOverride();
}

async function getCheckingAnchor(): Promise<{ balance: number | null; updatedAt?: string }> {
  try {
    const user = await supabaseBudgetRepo.getUser();
    if (user) {
      const savedAnchor = await supabaseBudgetRepo.getCheckingAnchor();
      localBudgetRepo.saveAnchorOverride(savedAnchor.balance);
      return savedAnchor;
    }
  } catch {
    // Fall through to local persistence if auth/Supabase is unavailable.
  }

  return localBudgetRepo.getCheckingAnchor();
}

async function saveAnchorOverride(override: number | null): Promise<number | null> {
  try {
    const user = await supabaseBudgetRepo.getUser();
    if (user) {
      const savedOverride = await supabaseBudgetRepo.saveAnchorOverride(override);
      localBudgetRepo.saveAnchorOverride(savedOverride);
      return savedOverride;
    }
  } catch (error) {
    console.error("[BudgetRepo] Supabase anchor save failed", { error });
    throw error;
  }

  return localBudgetRepo.saveAnchorOverride(override);
}

async function saveCheckingAnchor(override: number | null): Promise<{ balance: number | null; updatedAt: string }> {
  try {
    const user = await supabaseBudgetRepo.getUser();
    if (user) {
      const savedAnchor = await supabaseBudgetRepo.saveCheckingAnchor(override);
      localBudgetRepo.saveCheckingAnchor(savedAnchor.balance);
      return savedAnchor;
    }
  } catch {
    // Fall through to local persistence if auth/Supabase is unavailable.
  }

  return localBudgetRepo.saveCheckingAnchor(override);
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

async function getSpendLogs(monthKey: string): Promise<SpendLogEntry[]> {
  try {
    const user = await supabaseBudgetRepo.getUser();
    if (user) {
      return await supabaseBudgetRepo.getSpendLogs(monthKey);
    }
  } catch {
    // Fall through to local persistence if auth/Supabase is unavailable.
  }

  return localBudgetRepo.getSpendLogs(monthKey);
}

async function getDockItemStates(monthKey: string): Promise<DockItemState[]> {
  try {
    const user = await supabaseBudgetRepo.getUser();
    if (user) {
      return await supabaseBudgetRepo.getDockItemStates(monthKey);
    }
  } catch {
    // Fall through to local persistence if auth/Supabase is unavailable.
  }

  return localBudgetRepo.getDockItemStates(monthKey);
}

async function saveDockItemState(state: DockItemState): Promise<DockItemState> {
  try {
    const user = await supabaseBudgetRepo.getUser();
    if (user) {
      const savedState = await supabaseBudgetRepo.saveDockItemState(state);
      localBudgetRepo.saveDockItemState(savedState);
      return savedState;
    }
  } catch {
    // Fall through to local persistence if auth/Supabase is unavailable.
  }

  return localBudgetRepo.saveDockItemState(state);
}

async function deleteDockItemState(
  monthKey: string,
  itemId: string,
  itemKind: DockItemState["itemKind"],
  weekIndex: number,
) {
  try {
    const user = await supabaseBudgetRepo.getUser();
    if (user) {
      await supabaseBudgetRepo.deleteDockItemState(monthKey, itemId, itemKind, weekIndex);
      localBudgetRepo.deleteDockItemState(monthKey, itemId, itemKind, weekIndex);
      return;
    }
  } catch {
    // Fall through to local persistence if auth/Supabase is unavailable.
  }

  localBudgetRepo.deleteDockItemState(monthKey, itemId, itemKind, weekIndex);
}

async function saveSpendLog(entry: SpendLogEntry): Promise<SpendLogEntry> {
  try {
    const user = await supabaseBudgetRepo.getUser();
    if (user) {
      const savedEntry = await supabaseBudgetRepo.saveSpendLog(entry);
      localBudgetRepo.saveSpendLog(savedEntry);
      return savedEntry;
    }
  } catch {
    // Fall through to local persistence if auth/Supabase is unavailable.
  }

  return localBudgetRepo.saveSpendLog(entry);
}

async function deleteSpendLog(monthKey: string, entryId: string) {
  try {
    const user = await supabaseBudgetRepo.getUser();
    if (user) {
      await supabaseBudgetRepo.deleteSpendLog(monthKey, entryId);
      localBudgetRepo.deleteSpendLog(monthKey, entryId);
      return;
    }
  } catch {
    // Fall through to local persistence if auth/Supabase is unavailable.
  }

  localBudgetRepo.deleteSpendLog(monthKey, entryId);
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
  clearMonthlyAmounts,
  clearMonthlyAmountsForItem,
  getMonthBalances,
  saveMonthBalance,
  getClosedMonths,
  closeMonth,
  reopenMonth,
  getAnchorOverride,
  getCheckingAnchor,
  saveAnchorOverride,
  saveCheckingAnchor,
  getClosedWeeks,
  closeWeek,
  getCCCharges,
  getDockItemStates,
  saveDockItemState,
  deleteDockItemState,
  getSpendLogs,
  saveSpendLog,
  deleteSpendLog,
  addCCCharges,
  getBuoys,
  saveBuoy,
  deleteBuoy,
};
