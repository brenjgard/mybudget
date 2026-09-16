import type { DockItemState, LineItem } from "./types";

// Occurrence actions depend on recorded activity, never category or creation source.
export function budgetActions(item: LineItem, state: DockItemState | undefined, spent: number) {
  const skipped = state?.status === "skipped";
  const done = state?.status === "cleared";
  return {
    edit: !done && !skipped,
    skip: !done && !skipped && spent === 0,
    restore: skipped,
    // Card purchases require a dated spend log to flow into Fleet obligations.
    done: item.paymentMethod === "checking" && !done && !skipped && spent === 0,
    spend: !done && !skipped,
  };
}
