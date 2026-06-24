"use client";

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
              <div className="mt-4 flex flex-wrap gap-2">
                {nextPayment && (
                  <>
                    <button type="button" onClick={() => onEditPayment(nextPayment)} className="text-xs font-semibold text-harbor-teal">Edit payment</button>
                    <button type="button" onClick={() => onMarkPaymentPaid(nextPayment)} className="text-xs font-semibold text-harbor-green">Mark payment paid</button>
                    <button type="button" onClick={() => onMarkPaymentSkipped(nextPayment)} className="text-xs font-semibold text-slate-500">Skip payment</button>
                    <button type="button" onClick={() => onDeletePayment(nextPayment)} className="text-xs font-semibold text-harbor-red">Delete payment</button>
                  </>
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
          onSchedule={onSchedulePayment}
        />
      </div>
    </section>
  );
}
