"use client";

import type { BudgetForecast } from "../lib/cash-flow-model";

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

export function BudgetForecastPanel({ forecast }: { forecast: BudgetForecast }) {
  return (
    <section className="rounded-2xl border border-harbor-teal-light bg-white shadow-sm">
      <div className="border-b border-harbor-teal-light px-4 py-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-harbor-teal">Budget / Forecast</p>
        <h2 className="mt-1 text-xl font-bold text-harbor-navy">Monthly Budget Progress</h2>
      </div>

      <div className="grid gap-3 border-b border-harbor-teal-light px-4 py-4 md:grid-cols-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-harbor-navy/45">Budget Planned</p>
          <p className="mt-1 text-lg font-bold text-harbor-navy">{formatMoney(forecast.totalPlanned)}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-harbor-navy/45">Actual Spent</p>
          <p className="mt-1 text-lg font-bold text-harbor-red">{formatMoney(forecast.totalActual)}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-harbor-navy/45">Budget Remaining</p>
          <p className={`mt-1 text-lg font-bold ${forecast.totalRemaining >= 0 ? "text-harbor-green" : "text-harbor-red"}`}>
            {formatMoney(forecast.totalRemaining)}
          </p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr className="bg-harbor-teal-light text-harbor-navy">
              <th className="px-3 py-3 text-left">Category</th>
              <th className="px-3 py-3 text-right">Budget Planned</th>
              <th className="px-3 py-3 text-right">Actual Spent</th>
              <th className="px-3 py-3 text-right">Budget Remaining</th>
              <th className="px-3 py-3 text-right">Over / Under</th>
              <th className="px-3 py-3 text-right">Checking/Cash Spend</th>
              <th className="px-3 py-3 text-right">Credit-Card Spend</th>
            </tr>
          </thead>
          <tbody>
            {forecast.categories.map((category) => (
              <tr key={category.categoryId} className="border-b border-slate-100">
                <td className="px-3 py-3 font-semibold text-harbor-navy">{category.categoryName ?? category.categoryId}</td>
                <td className="px-3 py-3 text-right font-medium text-harbor-navy">{formatMoney(category.planned)}</td>
                <td className="px-3 py-3 text-right font-medium text-harbor-red">{formatMoney(category.actual)}</td>
                <td className={`px-3 py-3 text-right font-semibold ${category.remaining >= 0 ? "text-harbor-green" : "text-harbor-red"}`}>
                  {formatMoney(category.remaining)}
                </td>
                <td className={`px-3 py-3 text-right font-semibold ${category.overUnder <= 0 ? "text-harbor-green" : "text-harbor-red"}`}>
                  {formatMoney(category.overUnder)}
                </td>
                <td className="px-3 py-3 text-right text-harbor-navy">{formatMoney((category.actualByPaymentMethod.checking ?? 0) + (category.actualByPaymentMethod.cash ?? 0))}</td>
                <td className="px-3 py-3 text-right text-harbor-navy">{formatMoney(category.actualByPaymentMethod.credit_card ?? 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
