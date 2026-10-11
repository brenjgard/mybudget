import type { CreditCardAccount, DockItemState, SpendLogEntry } from "./types";

export function paymentAmount(state: DockItemState) {
  return Number(state.actualAmount ?? state.plannedAmount ?? 0);
}

export function statementPayments(statement: DockItemState, states: DockItemState[]) {
  const [, cardId, dueDate] = statement.itemId.split(":");
  if (!cardId || !dueDate) return [];
  return states.filter((state) => state.itemKind === "credit_card_payment"
    && state.itemId.startsWith(`scheduled-card-payment:${cardId}:${dueDate}:`)
    && state.status !== "skipped")
    .sort((a, b) => (a.pendingUntil ?? "").localeCompare(b.pendingUntil ?? ""));
}

export function statementProgress(statement: DockItemState, states: DockItemState[]) {
  const payments = statement.itemId.startsWith("opening-card-payment:") ? [statement] : statementPayments(statement, states);
  const amount = paymentAmount(statement);
  // Payment records are authoritative, including when a payment is undone in Dock.
  const hasPaymentHistory = states.some((row) => row.itemId.startsWith(statement.itemId.replace("card-statement:", "scheduled-card-payment:") + ":"));
  const paid = payments.length || hasPaymentHistory ? payments.filter((row) => row.status === "cleared").reduce((sum, row) => sum + paymentAmount(row), 0)
    : statement.status === "cleared" ? amount : 0;
  const scheduled = payments.filter((row) => row.status !== "cleared").reduce((sum, row) => sum + paymentAmount(row), 0);
  return { amount, paid, scheduled, outstanding: Math.max(0, amount - paid), unscheduled: Math.max(0, amount - paid - scheduled),
    isPaid: Math.round(paid * 100) >= Math.round(amount * 100) };
}

export function cardPaymentRecords(states: DockItemState[]) {
  const unique = new Map<string, DockItemState>();
  for (const state of states) {
    if (state.itemKind !== "credit_card_payment" || state.status === "skipped") continue;
    const isPayment = /^(scheduled-card-payment|opening-card-payment|projected-card-payment):/.test(state.itemId);
    // Older "Mark Statement Paid" records have no payment child. Count those once,
    // but never count a statement header in addition to its actual payments.
    const legacyReceipt = state.itemId.startsWith("card-statement:") && state.status === "cleared" && !states.some((row) => row.itemId.startsWith(state.itemId.replace("card-statement:", "scheduled-card-payment:") + ":"));
    if (isPayment || legacyReceipt) unique.set(state.itemId, state);
  }
  return [...unique.values()];
}

export function paymentIsAfterSnapshot(state: DockItemState, snapshot?: string) {
  if (!snapshot) return true;
  const scheduledDay = state.pendingUntil?.slice(0, 10);
  const clearedDay = state.clearedAt?.slice(0, 10);
  // A late check-off must not re-subtract a payment already in the snapshot.
  // An early payment, however, happened by the time it was marked paid.
  const paymentDay = scheduledDay && clearedDay ? (scheduledDay < clearedDay ? scheduledDay : clearedDay) : scheduledDay ?? clearedDay;
  if (!paymentDay) return false;
  const snapshotDay = snapshot.slice(0, 10);
  if (paymentDay !== snapshotDay) return paymentDay > snapshotDay;
  return clearedDay === paymentDay && Boolean(state.clearedAt && new Date(state.clearedAt).getTime() > new Date(snapshot).getTime());
}

export function expectedCardBalance(card: CreditCardAccount, spendLogs: SpendLogEntry[], states: DockItemState[]) {
  const snapshotDay = card.currentBalanceUpdatedAt?.slice(0, 10) ?? "";
  const spending = spendLogs.filter((entry) => entry.paymentMethod === card.id && entry.date > snapshotDay)
    .reduce((sum, entry) => sum + entry.amount, 0);
  const payments = cardPaymentRecords(states).filter((state) => state.itemId.split(":")[1] === card.id
    && state.status === "cleared" && paymentIsAfterSnapshot(state, card.currentBalanceUpdatedAt))
    .reduce((sum, state) => sum + paymentAmount(state), 0);
  return Number(card.currentBalance ?? 0) + spending - payments;
}

export function allocatedCardBalance(card: CreditCardAccount, states: DockItemState[], dueDate: string) {
  return cardPaymentRecords(states).filter((state) => state.itemId.split(":")[1] === card.id && !state.itemId.startsWith("projected-card-payment:"))
    .filter((state) => state.status === "cleared"
      ? paymentIsAfterSnapshot(state, card.currentBalanceUpdatedAt)
      : Boolean(state.pendingUntil && state.pendingUntil <= dueDate))
    .reduce((sum, state) => sum + paymentAmount(state), 0);
}
