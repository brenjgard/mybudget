import { AppSettings } from "./types";

const SETTINGS_KEY = "gardner_budget_settings";
const AMOUNTS_KEY = "gardner_budget_amounts";

export function loadSettings(): AppSettings | null {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AppSettings;
  } catch {
    return null;
  }
}

export function saveSettings(settings: AppSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function loadAmounts(monthKey?: string): Record<string, Record<number, number>> {
  try {
    const key = monthKey ? `gardner_budget_amounts_${monthKey}` : AMOUNTS_KEY;
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function saveAmounts(amounts: Record<string, Record<number, number>>, monthKey?: string) {
  const key = monthKey ? `gardner_budget_amounts_${monthKey}` : AMOUNTS_KEY;
  localStorage.setItem(key, JSON.stringify(amounts));
}

export function clearAll() {
  localStorage.removeItem(SETTINGS_KEY);
  localStorage.removeItem(AMOUNTS_KEY);
}
export function loadMonthBalances(): Record<string, number> {
  try {
    const raw = localStorage.getItem("gardner_budget_month_balances");
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, number>;
  } catch {
    return {};
  }
}

export function saveMonthBalances(balances: Record<string, number>) {
  localStorage.setItem("gardner_budget_month_balances", JSON.stringify(balances));
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
    const raw = localStorage.getItem(CC_CHARGES_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as CCCharge[];
  } catch {
    return [];
  }
}

export function saveCCCharges(charges: CCCharge[]) {
  localStorage.setItem(CC_CHARGES_KEY, JSON.stringify(charges));
}
