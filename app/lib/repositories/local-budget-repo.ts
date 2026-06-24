"use client";

import { localRepo } from "../local-repo";
import type { CCCharge } from "../local-repo";
import type { Buoy } from "../local-repo";
import { scopedStorageKey, warnIfLegacyStorageExists } from "../local-storage-scope";
import type { ActualTransaction, AppSettings, BudgetItem, CashFlowEvent, CreditCardPayment, DockItemState, SpendLogEntry } from "../types";

const CLOSED_WEEKS_KEY = "harbor_closed_weeks";
const CLOSED_MONTHS_KEY = "harbor_closed_months";

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

function loadClosedMonthKeys(): string[] {
  try {
    warnIfLegacyStorageExists(CLOSED_MONTHS_KEY, "closed months");
    return JSON.parse(localStorage.getItem(scopedStorageKey(CLOSED_MONTHS_KEY)) ?? "[]") as string[];
  } catch {
    return [];
  }
}

function saveClosedMonthKeys(keys: string[]) {
  localStorage.setItem(scopedStorageKey(CLOSED_MONTHS_KEY), JSON.stringify(keys));
}

function upsertById<T extends { id: string; createdAt?: string; updatedAt?: string }>(entries: T[], entry: T): T[] {
  return entries.some((item) => item.id === entry.id)
    ? entries.map((item) => (item.id === entry.id ? entry : item))
    : [...entries, entry];
}

function stampEntry<T extends { id: string; createdAt?: string; updatedAt?: string }>(entry: T): T {
  const now = new Date().toISOString();
  return {
    ...entry,
    id: entry.id || crypto.randomUUID(),
    createdAt: entry.createdAt || now,
    updatedAt: now,
  };
}

export const localBudgetRepo = {
  loadSettings(): AppSettings | null {
    return localRepo.loadSettings();
  },

  saveSettings(settings: AppSettings): AppSettings {
    localRepo.saveSettings(settings);
    return settings;
  },

  getBudgetItems(): BudgetItem[] {
    return localRepo.loadBudgetItems();
  },

  saveBudgetItem(item: BudgetItem): BudgetItem {
    const savedItem = stampEntry(item);
    localRepo.saveBudgetItems(upsertById(localRepo.loadBudgetItems(), savedItem));
    return savedItem;
  },

  deleteBudgetItem(itemId: string) {
    localRepo.saveBudgetItems(
      localRepo.loadBudgetItems().filter((item) => item.id !== itemId),
    );
  },

  getActualTransactions(): ActualTransaction[] {
    return localRepo.loadActualTransactions();
  },

  saveActualTransaction(transaction: ActualTransaction): ActualTransaction {
    const savedTransaction = stampEntry(transaction);
    localRepo.saveActualTransactions(upsertById(localRepo.loadActualTransactions(), savedTransaction));
    return savedTransaction;
  },

  deleteActualTransaction(transactionId: string) {
    localRepo.saveActualTransactions(
      localRepo.loadActualTransactions().filter((transaction) => transaction.id !== transactionId),
    );
  },

  getCreditCardPayments(): CreditCardPayment[] {
    return localRepo.loadCreditCardPayments();
  },

  saveCreditCardPayment(payment: CreditCardPayment): CreditCardPayment {
    const savedPayment = stampEntry(payment);
    localRepo.saveCreditCardPayments(upsertById(localRepo.loadCreditCardPayments(), savedPayment));
    return savedPayment;
  },

  deleteCreditCardPayment(paymentId: string) {
    localRepo.saveCreditCardPayments(
      localRepo.loadCreditCardPayments().filter((payment) => payment.id !== paymentId),
    );
  },

  getCashFlowEvents(): CashFlowEvent[] {
    return localRepo.loadCashFlowEvents();
  },

  saveCashFlowEvent(event: CashFlowEvent): CashFlowEvent {
    const savedEvent = stampEntry(event);
    localRepo.saveCashFlowEvents(upsertById(localRepo.loadCashFlowEvents(), savedEvent));
    return savedEvent;
  },

  deleteCashFlowEvent(eventId: string) {
    localRepo.saveCashFlowEvents(
      localRepo.loadCashFlowEvents().filter((event) => event.id !== eventId),
    );
  },

  getMonthlyAmounts(monthKey: string): Record<string, Record<number, number>> {
    return localRepo.loadAmounts(monthKey);
  },

  saveMonthlyAmounts(monthKey: string, amounts: Record<string, Record<number, number>>) {
    localRepo.saveAmounts(amounts, monthKey);
  },

  clearMonthlyAmountsForItem(monthKey: string, itemId: string) {
    const amounts = localRepo.loadAmounts(monthKey);
    if (!(itemId in amounts)) return;
    const nextAmounts = { ...amounts };
    delete nextAmounts[itemId];
    localRepo.saveAmounts(nextAmounts, monthKey);
  },

  getMonthBalances(): Record<string, number> {
    return localRepo.loadMonthBalances();
  },

  saveMonthBalance(monthKey: string, balance: number): Record<string, number> {
    const balances = { ...localRepo.loadMonthBalances(), [monthKey]: balance };
    localRepo.saveMonthBalances(balances);
    return balances;
  },

  getClosedMonths(): Set<string> {
    return new Set(loadClosedMonthKeys());
  },

  closeMonth(monthKey: string, endingBalance: number): Set<string> {
    this.saveMonthBalance(monthKey, endingBalance);
    const keys = new Set(loadClosedMonthKeys());
    keys.add(monthKey);
    saveClosedMonthKeys([...keys]);
    return this.getClosedMonths();
  },

  reopenMonth(monthKey: string): Set<string> {
    const keys = new Set(loadClosedMonthKeys());
    keys.delete(monthKey);
    saveClosedMonthKeys([...keys]);
    return this.getClosedMonths();
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

  getSpendLogs(monthKey: string): SpendLogEntry[] {
    return localRepo.loadSpendLogs(monthKey);
  },

  getDockItemStates(monthKey: string): DockItemState[] {
    return localRepo.loadDockItemStates(monthKey);
  },

  saveDockItemState(state: DockItemState): DockItemState {
    const now = new Date().toISOString();
    const existing = localRepo.loadDockItemStates(state.monthKey);
    const savedState = {
      ...state,
      id: state.id || crypto.randomUUID(),
      statusUpdatedAt: state.statusUpdatedAt || now,
      createdAt: state.createdAt || now,
      updatedAt: now,
    };
    const updated = existing.some((item) => (
      item.itemId === savedState.itemId
      && item.itemKind === savedState.itemKind
      && item.weekIndex === savedState.weekIndex
    ))
      ? existing.map((item) => (
        item.itemId === savedState.itemId && item.itemKind === savedState.itemKind && item.weekIndex === savedState.weekIndex
          ? savedState
          : item
      ))
      : [...existing, savedState];

    localRepo.saveDockItemStates(state.monthKey, updated);
    return savedState;
  },

  deleteDockItemState(monthKey: string, itemId: string, itemKind: DockItemState["itemKind"], weekIndex: number) {
    localRepo.saveDockItemStates(
      monthKey,
      localRepo.loadDockItemStates(monthKey).filter((state) => !(
        state.itemId === itemId
        && state.itemKind === itemKind
        && state.weekIndex === weekIndex
      )),
    );
  },

  saveSpendLog(entry: SpendLogEntry): SpendLogEntry {
    const now = new Date().toISOString();
    const existing = localRepo.loadSpendLogs(entry.monthKey);
    const savedEntry = {
      ...entry,
      id: entry.id || crypto.randomUUID(),
      createdAt: entry.createdAt || now,
      updatedAt: now,
    };
    const updated = existing.some((item) => item.id === savedEntry.id)
      ? existing.map((item) => (item.id === savedEntry.id ? savedEntry : item))
      : [...existing, savedEntry];

    localRepo.saveSpendLogs(entry.monthKey, updated);
    return savedEntry;
  },

  deleteSpendLog(monthKey: string, entryId: string) {
    localRepo.saveSpendLogs(
      monthKey,
      localRepo.loadSpendLogs(monthKey).filter((entry) => entry.id !== entryId),
    );
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
