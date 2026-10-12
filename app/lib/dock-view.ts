import { isoDate, monthKeyFor, buildDockProjection } from "./harbor-domain";
import type { HarborCashEvent, HarborWeekForecast } from "./harbor-domain";
import type { DockItemState } from "./types";

export function mergeDockEvents(events: HarborCashEvent[], states: DockItemState[] = []) {
  const byKey = new Map<string, HarborCashEvent>();

  events.forEach((event) => {
    if (event.itemId.startsWith("projected-card-payment:")) {
      const existing = byKey.get(event.itemId);
      byKey.set(event.itemId, existing ? {
        ...existing,
        amount: existing.amount + event.amount,
        status: existing.status === "done" || event.status === "done" ? "done" : "upcoming",
        state: existing.state ?? event.state,
      } : event);
      return;
    }

    const eventMonthKey = monthKeyFor(event.date.getFullYear(), event.date.getMonth());
    const key = [
      isoDate(event.date),
      event.itemId,
      event.itemKind,
      event.kind,
      event.amount,
      event.label,
      event.state ? occurrenceKey(event) : "",
    ].join("|");
    const existing = byKey.get(key);
    if (!existing || event.sourceMonthKey === eventMonthKey) byKey.set(key, event);
  });

  const merged = [...byKey.values()].flatMap((event) => {
    if (!event.itemId.startsWith("projected-card-payment:")) return [event];
    const state = states.find((row) => row.itemId === event.itemId && row.itemKind === "credit_card_payment");
    if (!state) return [event];
    if (state.status === "skipped") return [];
    return [{ ...event, state, sourceMonthKey: state.monthKey, weekIndex: state.weekIndex,
      amount: Number(state.actualAmount ?? event.amount), date: state.pendingUntil ? new Date(`${state.pendingUntil}T00:00:00`) : event.date,
      status: state.status === "cleared" ? "done" as const : "upcoming" as const }];
  });
  return merged.sort((a, b) => (
    a.date.getTime() - b.date.getTime()
    || (a.kind === "income" ? 0 : 1) - (b.kind === "income" ? 0 : 1)
    || a.label.localeCompare(b.label)
  ));
}


// Presentation uses the production projection points, including intra-day lows.
export function weekProjection(week: HarborWeekForecast) {
  return buildDockProjection(week.events, week.starting, week.week.start, week.week.end);
}

export function occurrenceKey(event: HarborCashEvent) {
  return `${event.sourceMonthKey}:${event.itemKind}:${event.weekIndex}:${event.itemId}`;
}
