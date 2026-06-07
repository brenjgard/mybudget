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
import type { DockItemState, SpendLogEntry } from "./types";

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

export const localRepo = {
  clearAll,
  loadAmounts,
  loadBuoys,
  loadCCCharges,
  loadDockItemStates,
  loadMonthBalances,
  loadSettings,
  loadSpendLogs,
  saveAmounts,
  saveBuoys,
  saveCCCharges,
  saveDockItemStates,
  saveFeedback,
  saveMonthBalances,
  saveSpendLogs,
  saveSettings,
};

export type { CCCharge };
