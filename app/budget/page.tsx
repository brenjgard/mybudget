"use client";

import { BudgetForecastPanel } from "../components/BudgetForecastPanel";
import { BudgetItemManager } from "../components/BudgetItemManager";
import { useHarborMonth } from "../lib/use-harbor-month";

export default function BudgetPage() {
  const harbor = useHarborMonth();

  if (!harbor.loaded || !harbor.settings) {
    return <main className="flex-1 bg-harbor-offwhite p-4 text-sm text-harbor-navy/60">Loading Budget...</main>;
  }

  return (
    <main className="flex-1 bg-harbor-offwhite p-4 text-harbor-navy">
      <div className="mx-auto max-w-[1280px] space-y-5">
        <section className="rounded-2xl border border-harbor-teal-light bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-harbor-teal">Monthly Budget Plan</p>
          <h1 className="mt-1 text-2xl font-bold">{harbor.monthName}</h1>
          <p className="mt-2 text-sm text-harbor-navy/60">
            What this month is expected to cost across all categories, regardless of checking/cash or credit-card payment method.
          </p>
        </section>
        <BudgetForecastPanel forecast={harbor.budgetForecast} mode="plan" />
        <BudgetItemManager
          budgetItems={harbor.budgetItems}
          categories={harbor.settings.categories}
          accounts={harbor.paymentAccounts}
          onSave={harbor.saveBudgetItem}
          onDeactivate={harbor.deactivateBudgetItem}
        />
      </div>
    </main>
  );
}
