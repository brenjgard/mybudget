"use client";

import { CreditCardSummaryPanel } from "../components/CreditCardSummaryPanel";
import { useHarborMonth } from "../lib/use-harbor-month";

export default function AccountsPage() {
  const harbor = useHarborMonth();

  if (!harbor.loaded || !harbor.settings) {
    return <main className="flex-1 bg-harbor-offwhite p-4 text-sm text-harbor-navy/60">Loading Accounts...</main>;
  }

  return (
    <main className="flex-1 bg-harbor-offwhite p-4 text-harbor-navy">
      <div className="mx-auto max-w-[1280px] space-y-5">
        <section className="rounded-2xl border border-harbor-teal-light bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-harbor-teal">Accounts</p>
          <h1 className="mt-1 text-2xl font-bold">Checking Cash and Credit Cards</h1>
          <p className="mt-2 text-sm text-harbor-navy/60">
            Supporting details for the Budget, Dock, and Spending views.
          </p>
          <div className="mt-4 rounded-xl border border-slate-100 bg-harbor-offwhite p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-harbor-navy/45">Current Checking Cash</p>
            <p className="mt-1 text-2xl font-bold text-harbor-green">
              {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(harbor.currentAnchor)}
            </p>
          </div>
        </section>

        <CreditCardSummaryPanel
          creditCards={harbor.paymentAccounts.filter((account) => account.type === "credit_card")}
          cashAccounts={harbor.paymentAccounts.filter((account) => account.type === "checking" || account.type === "cash")}
          transactions={harbor.currentMonthActualTransactions.filter((transaction) => transaction.paymentMethod === "credit_card")}
          payments={harbor.creditCardPayments}
          onSchedulePayment={async (payment) => { await harbor.scheduleCreditCardPayment(payment); }}
          onEditPayment={() => undefined}
          onMarkPaymentPaid={(payment) => void harbor.markCreditCardPayment(payment, "paid")}
          onMarkPaymentSkipped={(payment) => void harbor.markCreditCardPayment(payment, "skipped")}
          onDeletePayment={(payment) => void harbor.deleteCreditCardPayment(payment)}
        />
      </div>
    </main>
  );
}
