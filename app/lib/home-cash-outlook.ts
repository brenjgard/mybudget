import { budgetRepo } from "./repositories/budget-repo";
import { buildProjectedAmounts } from "./schedule";
import { buildCashEvents, buildDockForecast, buildDockProjection, getCalendarWeeksForMonth, getCalendarWeeksForRange, monthKeyFor, monthPartsFromKey } from "./harbor-domain";
import { mergeDockEvents } from "./dock-view";
import { currentDockWeekOffset, pastOccurrenceStates } from "./dock-reconciliation";
import { forecastHistoryStart } from "./forecast-history";
import type { AppSettings, DockItemState } from "./types";
import type { HarborCashEvent, HarborWeekForecast } from "./harbor-domain";

export function lowestDockPoint(weeks: HarborWeekForecast[], balance: number, anchor: Date) {
  return weeks.reduce((low, week) => week.lowest < low.balance ? { balance: week.lowest, date: week.lowestDate } : low,
    { balance: weeks[0]?.lowest ?? balance, date: weeks[0]?.lowestDate ?? anchor });
}

export async function loadHomeCashOutlook(settings: AppSettings, today = new Date()) {
  const [saved, oldest] = await Promise.all([budgetRepo.getCheckingAnchor(), budgetRepo.getEarliestUnresolvedDockMonth()]);
  const date = saved.updatedAt ? new Date(saved.updatedAt) : today;
  const valid = Number.isNaN(date.getTime()) ? today : date;
  const anchor = new Date(valid.getFullYear(), valid.getMonth(), valid.getDate());
  const balance = saved.balance ?? settings.checkingBalance;
  // Match Dock's default eight-week window, including cash flow before the current week.
  const offset = currentDockWeekOffset(anchor, today);
  const weeks = getCalendarWeeksForRange(anchor, offset + 8);
  const end = weeks[weeks.length - 1].end;
  const start = forecastHistoryStart(anchor, settings, oldest);
  const keys: string[] = [];
  for (const d = new Date(start.getFullYear(), start.getMonth(), 1); d <= end; d.setMonth(d.getMonth() + 1)) keys.push(monthKeyFor(d.getFullYear(), d.getMonth()));
  const [records, buoys] = await Promise.all([Promise.all(keys.map(async monthKey => {
    const { year, month } = monthPartsFromKey(monthKey);
    const weeks = getCalendarWeeksForMonth(year, month);
    const [savedAmounts, spendLogs, dockStates] = await Promise.all([budgetRepo.getMonthlyAmounts(monthKey), budgetRepo.getSpendLogs(monthKey), budgetRepo.getDockItemStates(monthKey)]);
    return { monthKey, month, weeks, amounts: buildProjectedAmounts(settings, weeks, month, savedAmounts), spendLogs, dockStates };
  })), budgetRepo.getBuoys()]);
  const logs = records.flatMap(record => record.spendLogs);
  const states = records.flatMap(record => record.dockStates);
  const events = mergeDockEvents(records.flatMap(record => buildCashEvents({ ...record, settings, cardSpendLogs: logs, cardPaymentStates: states, buoys })), states);
  const active = events.filter(event => event.date >= anchor && event.status !== "done");
  const forecast = buildDockForecast(active, balance, weeks).slice(offset);
  const points = buildDockProjection(active, balance, anchor, end);
  return { balance, updatedAt: saved.updatedAt, anchor, end, events, forecast,
    lowest: lowestDockPoint(forecast, balance, anchor), ending: points.at(-1)?.balance ?? balance };
}

// Both Home and Dock preserve unresolved history before advancing the checking snapshot.
export async function saveReconciledChecking(balance: number, events: HarborCashEvent[], saveState: (state: DockItemState) => Promise<unknown> = budgetRepo.saveDockItemState) {
  if (!Number.isFinite(balance)) throw new Error("Enter a valid checking balance.");
  const now = new Date();
  const past = pastOccurrenceStates(events, new Date(now.getFullYear(), now.getMonth(), now.getDate()));
  for (const state of past) await saveState(state);
  const saved = await budgetRepo.saveCheckingAnchor(balance);
  return { saved, past };
}
