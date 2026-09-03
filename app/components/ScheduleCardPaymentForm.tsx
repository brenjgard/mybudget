"use client";

import { useMemo, useState } from "react";
import type { CreditCardPayment, PaymentAccount } from "../lib/types";

type Draft = {
  creditCardAccountId: string;
  cashAccountId: string;
  amount: string;
  scheduledDate: string;
  notes: string;
};

function todayISODate() {
  const today = new Date();
  return [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0"),
  ].join("-");
}

function suggestedPaymentAmount(card: PaymentAccount | undefined, payments: CreditCardPayment[]) {
  if (!card) return "";
  const unresolvedPayments = payments
    .filter((payment) => payment.creditCardAccountId === card.id && payment.status === "planned")
    .reduce((sum, payment) => sum + payment.amount, 0);
  return Math.max((card.currentBalance ?? 0) - unresolvedPayments, 0).toFixed(2);
}

export function ScheduleCardPaymentForm({
  creditCards,
  cashAccounts,
  onSchedule,
  payments = [],
}: {
  creditCards: PaymentAccount[];
  cashAccounts: PaymentAccount[];
  onSchedule: (payment: CreditCardPayment) => Promise<void>;
  payments?: CreditCardPayment[];
}) {
  const [draft, setDraft] = useState<Draft>({
    creditCardAccountId: creditCards[0]?.id ?? "",
    cashAccountId: cashAccounts[0]?.id ?? "checking",
    amount: suggestedPaymentAmount(creditCards[0], payments),
    scheduledDate: todayISODate(),
    notes: "",
  });
  const suggestedAmount = useMemo(() => {
    const card = creditCards.find((candidate) => candidate.id === draft.creditCardAccountId);
    return suggestedPaymentAmount(card, payments);
  }, [creditCards, draft.creditCardAccountId, payments]);

  async function submit() {
    const amount = Number(draft.amount);
    if (!draft.creditCardAccountId || !draft.cashAccountId || !Number.isFinite(amount) || amount <= 0 || !draft.scheduledDate) {
      return;
    }

    await onSchedule({
      id: crypto.randomUUID(),
      creditCardAccountId: draft.creditCardAccountId,
      cashAccountId: draft.cashAccountId,
      amount,
      scheduledDate: draft.scheduledDate,
      status: "planned",
      notes: draft.notes.trim() || undefined,
    });

    setDraft((current) => ({ ...current, amount: suggestedAmount, notes: "" }));
  }

  return (
    <div className="rounded-xl border border-harbor-teal-light bg-harbor-offwhite p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-harbor-navy/45">Schedule Credit-Card Payment</p>
      <div className="mt-3 grid gap-3 md:grid-cols-5">
        <select
          value={draft.creditCardAccountId}
          onChange={(event) => {
            const card = creditCards.find((candidate) => candidate.id === event.target.value);
            setDraft((current) => ({ ...current, creditCardAccountId: event.target.value, amount: suggestedPaymentAmount(card, payments) }));
          }}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-harbor-navy"
        >
          {creditCards.map((card) => (
            <option key={card.id} value={card.id}>{card.label}</option>
          ))}
        </select>
        <select
          value={draft.cashAccountId}
          onChange={(event) => setDraft((current) => ({ ...current, cashAccountId: event.target.value }))}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-harbor-navy"
        >
          {cashAccounts.map((account) => (
            <option key={account.id} value={account.id}>{account.label}</option>
          ))}
        </select>
        <input
          type="number"
          min="0"
          step="0.01"
          inputMode="decimal"
          placeholder="Scheduled payment amount"
          value={draft.amount}
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => setDraft((current) => ({ ...current, amount: event.target.value }))}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-harbor-navy"
        />
        <input
          type="date"
          value={draft.scheduledDate}
          onChange={(event) => setDraft((current) => ({ ...current, scheduledDate: event.target.value }))}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-harbor-navy"
        />
        <button
          type="button"
          onClick={() => void submit()}
          className="rounded-lg bg-harbor-navy px-4 py-2 text-sm font-medium text-white hover:bg-harbor-teal"
        >
          Schedule Payment
        </button>
        <input
          type="text"
          placeholder="Payment notes"
          value={draft.notes}
          onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-harbor-navy md:col-span-5"
        />
      </div>
    </div>
  );
}
