"use client";

import { useState } from "react";
import type { ActualTransaction, CreditCardPayment, PaymentAccount } from "../lib/types";
import { ScheduleCardPaymentForm } from "./ScheduleCardPaymentForm";

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

export function CreditCardSummaryPanel({
  creditCards,
  cashAccounts,
  transactions,
  payments,
  onSchedulePayment,
  onEditPayment,
  onMarkPaymentPaid,
  onMarkPaymentSkipped,
  onDeletePayment,
}: {
  creditCards: PaymentAccount[];
  cashAccounts: PaymentAccount[];
  transactions: ActualTransaction[];
  payments: CreditCardPayment[];
  onSchedulePayment: (payment: CreditCardPayment) => Promise<void>;
  onEditPayment: (payment: CreditCardPayment) => void;
  onMarkPaymentPaid: (payment: CreditCardPayment) => void;
  onMarkPaymentSkipped: (payment: CreditCardPayment) => void;
  onDeletePayment: (payment: CreditCardPayment) => void;
}) {
  const [editingPayment, setEditingPayment] = useState<CreditCardPayment | null>(null);
  const [editDraft, setEditDraft] = useState({ amount: "", scheduledDate: "", notes: "" });

  function startEdit(payment: CreditCardPayment) {
    setEditingPayment(payment);
    setEditDraft({
      amount: payment.amount.toFixed(2),
      scheduledDate: payment.scheduledDate,
      notes: payment.notes ?? "",
    });
    onEditPayment(payment);
  }

  async function saveEdit() {
    if (!editingPayment) return;
    const amount = Number(editDraft.amount);
    if (!Number.isFinite(amount) || amount <= 0 || !editDraft.scheduledDate) return;
    await onSchedulePayment({
      ...editingPayment,
      amount,
      scheduledDate: editDraft.scheduledDate,
      notes: editDraft.notes.trim() || undefined,
    });
    setEditingPayment(null);
  }

  return (
    <section className="rounded-2xl border border-harbor-teal-light bg-white shadow-sm">
      <div className="border-b border-harbor-teal-light px-4 py-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-harbor-teal">Credit-Card Liability</p>
        <h2 className="mt-1 text-xl font-bold text-harbor-navy">Cards and Scheduled Payments</h2>
      </div>

      <div className="grid gap-3 p-4 md:grid-cols-3">
        {creditCards.map((card) => {
          const purchases = transactions
            .filter((transaction) => transaction.accountId === card.id || (creditCards.length === 1 && transaction.paymentMethod === "credit_card"))
            .reduce((sum, transaction) => sum + transaction.amount, 0);
          const cardPayments = payments.filter((payment) => payment.creditCardAccountId === card.id);
          const scheduledPayments = cardPayments
            .filter((payment) => payment.status !== "skipped")
            .reduce((sum, payment) => sum + payment.amount, 0);
          const nextPayment = cardPayments
            .filter((payment) => payment.status === "planned")
            .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate))[0];
          const paid = cardPayments
            .filter((payment) => payment.status === "paid")
            .reduce((sum, payment) => sum + payment.amount, 0);
          const projectedLiability = card.currentBalance + purchases - paid;

          return (
            <div key={card.id} className="rounded-xl border border-slate-100 bg-harbor-offwhite p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-bold text-harbor-navy">{card.label}</h3>
                  <p className="mt-1 text-xs text-harbor-navy/50">
                    Statement closes {card.statementCloseDay ?? card.statementClosingDay ?? "not set"} · Due {card.paymentDueDay ?? "not set"}
                  </p>
                </div>
                <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-harbor-navy/60">Liability</span>
              </div>
              <dl className="mt-4 grid gap-3">
                <div className="flex items-center justify-between">
                  <dt className="text-sm text-harbor-navy/60">Projected credit-card liability</dt>
                  <dd className="font-bold text-harbor-red">{formatMoney(projectedLiability)}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-sm text-harbor-navy/60">Purchases this month</dt>
                  <dd className="font-semibold text-harbor-navy">{formatMoney(purchases)}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-sm text-harbor-navy/60">Scheduled payments</dt>
                  <dd className="font-semibold text-harbor-navy">{formatMoney(scheduledPayments)}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-sm text-harbor-navy/60">Next scheduled payment</dt>
                  <dd className="font-semibold text-harbor-navy">{nextPayment ? nextPayment.scheduledDate : "None"}</dd>
                </div>
              </dl>
              <div className="mt-4 space-y-2">
                <p className="text-xs font-bold uppercase tracking-wide text-harbor-navy/45">Statement and payment records</p>
                {cardPayments.length === 0 ? (
                  <p className="text-xs text-harbor-navy/45">No card payments or opening statements recorded.</p>
                ) : (
                  <div className="divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white">
                    {cardPayments.map((payment) => (
                      <div key={payment.id} className="p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-semibold text-harbor-navy">{formatMoney(payment.amount)}</div>
                            <div className="mt-0.5 text-xs text-harbor-navy/50">
                              {paymentLabel(payment)} | {payment.scheduledDate}
                            </div>
                            {payment.notes && <div className="mt-1 text-xs text-harbor-navy/55">{payment.notes}</div>}
                          </div>
                          <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-harbor-navy/60">{payment.status}</span>
                        </div>
                        {editingPayment?.id === payment.id ? (
                          <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr]">
                            <input type="number" min="0" step="0.01" inputMode="decimal" value={editDraft.amount} onFocus={(event) => event.currentTarget.select()} onChange={(event) => setEditDraft((current) => ({ ...current, amount: event.target.value }))} className="rounded-md border border-slate-200 px-3 py-2 text-sm" />
                            <input type="date" value={editDraft.scheduledDate} onChange={(event) => setEditDraft((current) => ({ ...current, scheduledDate: event.target.value }))} className="rounded-md border border-slate-200 px-3 py-2 text-sm" />
                            <input value={editDraft.notes} onChange={(event) => setEditDraft((current) => ({ ...current, notes: event.target.value }))} placeholder="Notes" className="rounded-md border border-slate-200 px-3 py-2 text-sm sm:col-span-2" />
                            <div className="flex gap-2 sm:col-span-2">
                              <button type="button" onClick={() => void saveEdit()} className="rounded-md bg-harbor-teal px-3 py-1.5 text-xs font-semibold text-white">Save</button>
                              <button type="button" onClick={() => setEditingPayment(null)} className="rounded-md px-3 py-1.5 text-xs font-semibold text-harbor-navy/50">Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button type="button" onClick={() => startEdit(payment)} className="text-xs font-semibold text-harbor-teal">Edit</button>
                            {payment.status !== "paid" && <button type="button" onClick={() => onMarkPaymentPaid(payment)} className="text-xs font-semibold text-harbor-green">Mark paid/closed</button>}
                            {payment.status !== "skipped" && <button type="button" onClick={() => onMarkPaymentSkipped(payment)} className="text-xs font-semibold text-slate-500">Skip/close without payment</button>}
                            <button type="button" onClick={() => {
                              if (window.confirm("Delete this statement/payment record? This will not delete the card, transactions, or balance snapshots.")) {
                                onDeletePayment(payment);
                              }
                            }} className="text-xs font-semibold text-harbor-red">Delete</button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-t border-harbor-teal-light p-4">
        <ScheduleCardPaymentForm
          creditCards={creditCards}
          cashAccounts={cashAccounts}
          payments={payments}
          onSchedule={onSchedulePayment}
        />
      </div>
    </section>
  );
}

function paymentLabel(payment: CreditCardPayment) {
  if (payment.sourceType === "opening_statement") return "Opening statement";
  if (payment.sourceType === "generated") return "Generated payment";
  return "Manual payment";
}
