import { AppSettings } from "./types";
import { scopedStorageKey, warnIfLegacyStorageExists } from "./local-storage-scope";

const SETTINGS_KEY = "gardner_budget_settings";
const AMOUNTS_KEY = "gardner_budget_amounts";

export function loadSettings(): AppSettings | null {
  try {
    warnIfLegacyStorageExists(SETTINGS_KEY, "settings");
    const raw = localStorage.getItem(scopedStorageKey(SETTINGS_KEY));
    if (!raw) return null;
    return JSON.parse(raw) as AppSettings;
  } catch {
    return null;
  }
}

export function saveSettings(settings: AppSettings) {
  localStorage.setItem(scopedStorageKey(SETTINGS_KEY), JSON.stringify(settings));
}

export function loadAmounts(monthKey?: string): Record<string, Record<number, number>> {
  try {
    const key = monthKey ? `gardner_budget_amounts_${monthKey}` : AMOUNTS_KEY;
    warnIfLegacyStorageExists(key, "monthly amounts");
    const raw = localStorage.getItem(scopedStorageKey(key));
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function saveAmounts(amounts: Record<string, Record<number, number>>, monthKey?: string) {
  const key = monthKey ? `gardner_budget_amounts_${monthKey}` : AMOUNTS_KEY;
  localStorage.setItem(scopedStorageKey(key), JSON.stringify(amounts));
}

export function clearAll() {
  localStorage.removeItem(scopedStorageKey(SETTINGS_KEY));
  localStorage.removeItem(scopedStorageKey(AMOUNTS_KEY));
}
export function loadMonthBalances(): Record<string, number> {
  try {
    const key = "gardner_budget_month_balances";
    warnIfLegacyStorageExists(key, "month balances");
    const raw = localStorage.getItem(scopedStorageKey(key));
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, number>;
  } catch {
    return {};
  }
}

export function saveMonthBalances(balances: Record<string, number>) {
  localStorage.setItem(scopedStorageKey("gardner_budget_month_balances"), JSON.stringify(balances));
}

const CC_CHARGES_KEY = "harbor_cc_charges";

export type CCCharge = {
  itemId: string;
  itemName: string;
  card: string;
  cardLabel: string;
  amount: number;
  weekLabel: string;
  dateMoved: string;
};

export function loadCCCharges(): CCCharge[] {
  try {
    warnIfLegacyStorageExists(CC_CHARGES_KEY, "credit card charges");
    const raw = localStorage.getItem(scopedStorageKey(CC_CHARGES_KEY));
    if (!raw) return [];
    return JSON.parse(raw) as CCCharge[];
  } catch {
    return [];
  }
}

export function saveCCCharges(charges: CCCharge[]) {
  localStorage.setItem(scopedStorageKey(CC_CHARGES_KEY), JSON.stringify(charges));
}
