import type { FrequencyType, LineItem, Recurrence } from "./types";

export type RecurringDraft = { id: string; name: string; amount: string; frequency: "weekly" | "biweekly" | "monthly" | "quarterly" | "annual"; date: string; paymentMethod: string };
export function recurringSetupItem(draft: RecurringDraft, income: boolean): LineItem {
  const date = new Date(draft.date + "T00:00:00");
  const amount = Number(draft.amount);
  if (!draft.name.trim() || !draft.amount.trim() || !Number.isFinite(amount) || amount <= 0 || Number.isNaN(date.getTime())) throw new Error("Enter a name, an amount greater than zero, and a valid next date.");
  const recurrence: Recurrence = { type: draft.frequency, startDate: draft.date,
    ...(draft.frequency === "weekly" || draft.frequency === "biweekly" ? { daysOfWeek: [date.getDay()] } : { daysOfMonth: [date.getDate()] }) };
  const frequencies: Record<RecurringDraft["frequency"], FrequencyType> = { weekly: "every-week", biweekly: "every-other-week", monthly: "once-a-month-1", quarterly: "quarterly", annual: "annually" };
  return { id: draft.id, name: draft.name.trim(), defaultAmount: amount, isIncome: income, category: income ? "Income" : "Bills", paymentMethod: income ? "checking" : draft.paymentMethod,
    frequency: frequencies[draft.frequency], anchorDate: draft.date, recurrence, waveType: "recurring", rippleType: "fixed", ...(income ? {} : { planType: "scheduled_expense" as const }) };
}
