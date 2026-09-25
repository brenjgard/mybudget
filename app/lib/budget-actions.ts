import { getItemBehavior } from "./ripple-type";
import type { DockItemState, LineItem } from "./types";

// Preserve the existing persistence paths; presentation follows item semantics.
export function budgetActions(item: LineItem, state: DockItemState | undefined, spent: number, remaining = Infinity) {
  const skipped = state?.status === "skipped";
  const done = state?.status === "cleared";
  const behavior = item.isIncome ? "income" : item.planType === "scheduled_expense" ? "fixed_bill" : getItemBehavior(item);
  const flexible = behavior === "flexible_spend";
  const available = !done && !skipped;
  return {
    edit: available,
    skip: available && spent === 0,
    restore: skipped,
    done: !flexible && item.paymentMethod === "checking" && available && spent === 0,
    // Card-funded bills still need a dated transaction for Fleet.
    spend: available && (flexible || (remaining > 0 && (item.paymentMethod !== "checking" || spent > 0))),
    primaryLabel: flexible ? "Log Spend" : behavior === "income" ? "Mark Received" : "Mark Paid",
    recordedLabel: flexible ? "Spent" : behavior === "income" ? "Received" : "Paid",
  };
}
