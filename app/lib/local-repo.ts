import {
  CCCharge,
  clearAll,
  loadAmounts,
  loadCCCharges,
  loadMonthBalances,
  loadSettings,
  saveAmounts,
  saveCCCharges,
  saveMonthBalances,
  saveSettings,
} from "./storage";
import { scopedStorageKey, warnIfLegacyStorageExists } from "./local-storage-scope";
import type { ActualTransaction, BudgetItem, CashFlowEvent, CreditCardPayment, DockItemState, SpendLogEntry } from "./types";

export type Buoy = {
  id: string;
  name: string;
  current: number;
  goal: number;
  autoSave?: number;
  autoSaveDay?: number;
  lastAutoSave?: string;
};

export type FeedbackType = "bug" | "suggestion" | "praise" | "other";

type FeedbackEntry = {
  type: FeedbackType;
  message: string;
  email: string;
  submittedAt: string;
};

const BUOYS_KEY = "harbor_buoys";
const FEEDBACK_KEY = "harbor_alpha_feedback";
const SPEND_LOGS_KEY = "harbor_spend_logs";
const DOCK_ITEM_STATES_KEY = "harbor_dock_item_states";
const BUDGET_ITEMS_KEY = "harbor_budget_items";
const ACTUAL_TRANSACTIONS_KEY = "harbor_actual_transactions";
const CREDIT_CARD_PAYMENTS_KEY = "harbor_credit_card_payments";
const CASH_FLOW_EVENTS_KEY = "harbor_cash_flow_events";

function loadBuoys(): Buoy[] {
  try {
    warnIfLegacyStorageExists(BUOYS_KEY, "buoys");
    const raw = localStorage.getItem(scopedStorageKey(BUOYS_KEY));
    return raw ? (JSON.parse(raw) as Buoy[]) : [];
  } catch {
    return [];
  }
}

function saveBuoys(buoys: Buoy[]) {
  localStorage.setItem(scopedStorageKey(BUOYS_KEY), JSON.stringify(buoys));
}

function saveFeedback(entry: FeedbackEntry) {
  try {
    const existing = JSON.parse(localStorage.getItem(FEEDBACK_KEY) ?? "[]") as FeedbackEntry[];
    existing.push(entry);
    localStorage.setItem(FEEDBACK_KEY, JSON.stringify(existing));
  } catch {
    // ignore
  }
}

function loadSpendLogs(monthKey: string): SpendLogEntry[] {
  try {
    const key = `${SPEND_LOGS_KEY}_${monthKey}`;
    warnIfLegacyStorageExists(key, "spend logs");
    const raw = localStorage.getItem(scopedStorageKey(key));
    return raw ? (JSON.parse(raw) as SpendLogEntry[]) : [];
  } catch {
    return [];
  }
}

function saveSpendLogs(monthKey: string, entries: SpendLogEntry[]) {
  localStorage.setItem(scopedStorageKey(`${SPEND_LOGS_KEY}_${monthKey}`), JSON.stringify(entries));
}

function loadDockItemStates(monthKey: string): DockItemState[] {
  try {
    const key = `${DOCK_ITEM_STATES_KEY}_${monthKey}`;
    warnIfLegacyStorageExists(key, "Dock item states");
    const raw = localStorage.getItem(scopedStorageKey(key));
    return raw ? (JSON.parse(raw) as DockItemState[]) : [];
  } catch {
    return [];
  }
}

function saveDockItemStates(monthKey: string, states: DockItemState[]) {
  localStorage.setItem(scopedStorageKey(`${DOCK_ITEM_STATES_KEY}_${monthKey}`), JSON.stringify(states));
}

function loadList<T>(key: string, label: string): T[] {
  try {
    warnIfLegacyStorageExists(key, label);
    const raw = localStorage.getItem(scopedStorageKey(key));
    return raw ? (JSON.parse(raw) as T[]) : [];
  } catch {
    return [];
  }
}

function saveList<T>(key: string, entries: T[]) {
  localStorage.setItem(scopedStorageKey(key), JSON.stringify(entries));
}

export const localRepo = {
  clearAll,
  loadAmounts,
  loadActualTransactions: () => loadList<ActualTransaction>(ACTUAL_TRANSACTIONS_KEY, "actual transactions"),
  loadBudgetItems: () => loadList<BudgetItem>(BUDGET_ITEMS_KEY, "budget items"),
  loadBuoys,
  loadCCCharges,
  loadCashFlowEvents: () => loadList<CashFlowEvent>(CASH_FLOW_EVENTS_KEY, "cash flow events"),
  loadCreditCardPayments: () => loadList<CreditCardPayment>(CREDIT_CARD_PAYMENTS_KEY, "credit card payments"),
  loadDockItemStates,
  loadMonthBalances,
  loadSettings,
  loadSpendLogs,
  saveAmounts,
  saveActualTransactions: (entries: ActualTransaction[]) => saveList(ACTUAL_TRANSACTIONS_KEY, entries),
  saveBudgetItems: (entries: BudgetItem[]) => saveList(BUDGET_ITEMS_KEY, entries),
  saveBuoys,
  saveCCCharges,
  saveCashFlowEvents: (entries: CashFlowEvent[]) => saveList(CASH_FLOW_EVENTS_KEY, entries),
  saveCreditCardPayments: (entries: CreditCardPayment[]) => saveList(CREDIT_CARD_PAYMENTS_KEY, entries),
  saveDockItemStates,
  saveFeedback,
  saveMonthBalances,
  saveSpendLogs,
  saveSettings,
};

export type { CCCharge };
