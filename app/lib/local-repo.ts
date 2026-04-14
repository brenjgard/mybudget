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

function loadBuoys(): Buoy[] {
  try {
    const raw = localStorage.getItem(BUOYS_KEY);
    return raw ? (JSON.parse(raw) as Buoy[]) : [];
  } catch {
    return [];
  }
}

function saveBuoys(buoys: Buoy[]) {
  localStorage.setItem(BUOYS_KEY, JSON.stringify(buoys));
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

export const localRepo = {
  clearAll,
  loadAmounts,
  loadBuoys,
  loadCCCharges,
  loadMonthBalances,
  loadSettings,
  saveAmounts,
  saveBuoys,
  saveCCCharges,
  saveFeedback,
  saveMonthBalances,
  saveSettings,
};

export type { CCCharge };
