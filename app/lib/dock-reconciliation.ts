import { isoDate, getCalendarWeeksForRange } from "./harbor-domain";
import { occurrenceKey } from "./dock-view";
import type { HarborCashEvent } from "./harbor-domain";
import type { DockItemState } from "./types";

export function currentDockWeekOffset(anchor: Date, today: Date) {
  const a = getCalendarWeeksForRange(anchor, 1)[0].start;
  const b = getCalendarWeeksForRange(today, 1)[0].start;
  return Math.max(0, Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 604800000));
}

// Materialize only unresolved past occurrences before advancing the checking anchor.
// Their source keys make this retryable and keep the backlog available after reload.
export function pastOccurrenceStates(events: HarborCashEvent[], cutoff: Date, skip = false): DockItemState[] {
  const groups = new Map<string, HarborCashEvent[]>();
  events.filter((event) => event.status !== "done").forEach((event) => {
    const key = occurrenceKey(event);
    groups.set(key, [...(groups.get(key) ?? []), event]);
  });
  return [...groups.values()].filter((group) => group.some((event) => event.date < cutoff) && (!skip || group.every((event) => event.date < cutoff))).map((group) => {
    const event = group[0];
    return {
      ...event.state, monthKey: event.sourceMonthKey, weekIndex: event.weekIndex, itemId: event.itemId, itemKind: event.itemKind,
      behaviorType: event.state?.behaviorType ?? (event.kind === "income" ? "income" : event.kind === "cardPayment" ? "credit_card_payment" : "fixed_bill"),
      status: skip ? "skipped" : event.state?.status ?? "upcoming",
      plannedAmount: event.state?.plannedAmount ?? event.amount,
      actualAmount: skip ? 0 : event.state?.actualAmount ?? event.amount,
      pendingUntil: group.length === 1 ? isoDate(event.date) : event.state?.pendingUntil,
      note: event.state?.note ?? event.label,
    };
  });
}
