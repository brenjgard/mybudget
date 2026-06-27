"use client";

import { BudgetForecastPanel } from "../components/BudgetForecastPanel";
import { useHarborMonth } from "../lib/use-harbor-month";

export default function SpendingPage() {
  const harbor = useHarborMonth();

  if (!harbor.loaded || !harbor.settings) {
    return <main className="flex-1 bg-harbor-offwhite p-4 text-sm text-harbor-navy/60">Loading Spending...</main>;
  }

  return (
    <main className="flex-1 bg-harbor-offwhite p-4 text-harbor-navy">
      <div className="mx-auto max-w-[1280px] space-y-5">
        <section className="rounded-2xl border border-harbor-teal-light bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-harbor-teal">Spending Tracker</p>
          <h1 className="mt-1 text-2xl font-bold">{harbor.monthName}</h1>
          <p className="mt-2 text-sm text-harbor-navy/60">
            Actual transactions against category budgets. Credit-card purchases count immediately here, but do not reduce checking cash.
          </p>
        </section>
        <BudgetForecastPanel forecast={harbor.budgetForecast} mode="spending" />
      </div>
    </main>
  );
}
