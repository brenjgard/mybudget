import { statementProgress } from "./card-payments";
import { isoDate } from "./harbor-domain";
import type { HarborCardObligation } from "./harbor-domain";
import type { DockItemState } from "./types";

export type HomeCardStatus = "Statement still to pay" | "Payment scheduled" | "Paid" | "Projected next cycle";
export type HomeCardRow = { id: string; cardId: string; label: string; status: HomeCardStatus; amount: number; date?: string };

export function homeCardSummary(obligations: HarborCardObligation[], states: DockItemState[]) {
  const rows: HomeCardRow[] = [];
  for (const obligation of obligations) {
    const card = obligation.card;
    const statements = states.filter(row => row.itemKind === "credit_card_payment" && row.status !== "skipped"
      && /^(card-statement|opening-card-payment):/.test(row.itemId) && row.itemId.split(":")[1] === card.id);
    for (const statement of statements) {
      const progress = statementProgress(statement, states);
      // Partition unpaid dollars: scheduling covers an obligation but is not a payment receipt.
      const scheduled = Math.min(progress.outstanding, Math.max(0, progress.scheduled));
      const stillToPay = Math.max(0, progress.outstanding - scheduled);
      const base = { cardId: card.id, label: card.label, date: statement.pendingUntil ?? statement.itemId.split(":")[2] };
      if (stillToPay > 0) rows.push({ ...base, id: statement.itemId + ":remaining", status: "Statement still to pay", amount: stillToPay });
      if (scheduled > 0) rows.push({ ...base, id: statement.itemId + ":scheduled", status: "Payment scheduled", amount: scheduled });
      if (progress.isPaid) rows.push({ ...base, id: statement.itemId + ":paid", status: "Paid", amount: progress.paid });
    }
    // A recorded statement supersedes the estimate for that same due-date cycle.
    if (obligation.amount > 0 && !statements.some(row => (row.itemId.split(":")[2] ?? row.pendingUntil) === isoDate(obligation.dueDate))) {
      rows.push({ id: card.id + ":projected", cardId: card.id, label: card.label, date: isoDate(obligation.dueDate), status: "Projected next cycle", amount: obligation.amount });
    }
  }
  rows.sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999") || a.label.localeCompare(b.label));
  const stillToPay = rows.filter(row => row.status === "Statement still to pay");
  const scheduled = rows.filter(row => row.status === "Payment scheduled");
  const firstDue = rows.find(row => row.status !== "Paid" && row.amount > 0 && row.date);
  const next = firstDue ? { ...firstDue, amount: rows.filter(row => row.cardId === firstDue.cardId && row.date === firstDue.date && row.status !== "Paid").reduce((sum, row) => sum + row.amount, 0) } : undefined;
  // Home shows the latest paid statement per card; Fleet retains the full history.
  const compactRows = rows.filter(row => row.status !== "Paid" || !rows.some(other => other.cardId === row.cardId && other.status === "Paid" && (other.date ?? "") > (row.date ?? "")));
  return { rows: compactRows, stillToPay: stillToPay.reduce((sum, row) => sum + row.amount, 0), scheduled: scheduled.reduce((sum, row) => sum + row.amount, 0),
    stillToPayCards: new Set(stillToPay.map(row => row.cardId)).size, scheduledCards: new Set(scheduled.map(row => row.cardId)).size, next };
}
