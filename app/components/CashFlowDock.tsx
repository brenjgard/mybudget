"use client";

import type { CashFlowForecast } from "../lib/cash-flow-model";

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function statusLabel(status: string) {
  if (status === "paid") return "Paid";
  if (status === "cleared") return "Cleared";
  if (status === "skipped") return "Skipped";
  if (status === "scheduled") return "Scheduled";
  if (status === "projected") return "Projected";
  return "Pending cash movement";
}

function sourceLabel(source: string) {
  if (source === "credit_card_payment") return "Scheduled payment";
  if (source === "transaction") return "Checking cash";
  if (source === "planned_budget_item") return "Projected";
  return "Cash event";
}

export function CashFlowDock({
  forecast,
  onAddCashEvent,
  onEditCashEvent,
  onMarkCashEventCleared,
  onSkipCashEvent,
  onDeleteCashEvent,
}: {
  forecast: CashFlowForecast;
  onAddCashEvent: () => void;
  onEditCashEvent: (eventId: string) => void;
  onMarkCashEventCleared: (eventId: string) => void;
  onSkipCashEvent: (eventId: string) => void;
  onDeleteCashEvent: (eventId: string) => void;
}) {
  return (
    <section className="rounded-2xl border border-harbor-teal-light bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-harbor-teal-light px-4 py-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-harbor-teal">Cash Flow Dock</p>
          <h2 className="mt-1 text-xl font-bold text-harbor-navy">Projected Checking Cash</h2>
        </div>
        <button
          type="button"
          onClick={onAddCashEvent}
          className="self-start rounded-lg bg-harbor-teal px-4 py-2 text-sm font-medium text-white hover:bg-harbor-teal/90 md:self-center"
        >
          Add One-Time Cash Event
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr className="bg-harbor-navy text-white">
              <th className="px-3 py-3 text-left">Week</th>
              <th className="px-3 py-3 text-right">Starting Checking Cash</th>
              <th className="px-3 py-3 text-right">Cash Inflows</th>
              <th className="px-3 py-3 text-right">Checking/Cash Outflows</th>
              <th className="px-3 py-3 text-right">Scheduled Card Payments</th>
              <th className="px-3 py-3 text-right">Ending Checking Cash</th>
            </tr>
          </thead>
          <tbody>
            {forecast.weekly.map((week) => (
              <tr key={week.key} className="border-b border-slate-100 align-top">
                <td className="px-3 py-3">
                  <div className="font-semibold text-harbor-navy">{week.label}</div>
                  <div className="text-xs text-harbor-navy/45">{week.startDate} to {week.endDate}</div>
                  {week.entries.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {week.entries.map((entry) => (
                        <div key={`${entry.source}-${entry.id}`} className="rounded-lg border border-slate-100 bg-harbor-offwhite px-3 py-2">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="font-medium text-harbor-navy">{entry.name}</div>
                              <div className="text-xs text-harbor-navy/50">{entry.date} · {sourceLabel(entry.source)}</div>
                            </div>
                            <div className={entry.direction === "inflow" ? "font-semibold text-harbor-green" : "font-semibold text-harbor-red"}>
                              {entry.direction === "inflow" ? "+" : "-"}{formatMoney(entry.amount)}
                            </div>
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-harbor-navy/60">
                              {statusLabel(entry.status)}
                            </span>
                            {entry.source === "cash_flow_event" && (
                              <>
                                <button type="button" onClick={() => onEditCashEvent(entry.id)} className="text-[11px] font-semibold text-harbor-teal">Edit</button>
                                <button type="button" onClick={() => onMarkCashEventCleared(entry.id)} className="text-[11px] font-semibold text-harbor-green">Mark cleared</button>
                                <button type="button" onClick={() => onSkipCashEvent(entry.id)} className="text-[11px] font-semibold text-slate-500">Skip</button>
                                <button type="button" onClick={() => onDeleteCashEvent(entry.id)} className="text-[11px] font-semibold text-harbor-red">Delete</button>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-3 py-3 text-right font-semibold text-harbor-navy">{formatMoney(week.startingCash)}</td>
                <td className="px-3 py-3 text-right font-semibold text-harbor-green">{formatMoney(week.inflows)}</td>
                <td className="px-3 py-3 text-right font-semibold text-harbor-red">{formatMoney(week.cashOutflows)}</td>
                <td className="px-3 py-3 text-right font-semibold text-harbor-red">{formatMoney(week.scheduledCreditCardPayments)}</td>
                <td className={`px-3 py-3 text-right font-bold ${week.endingCash >= 0 ? "text-harbor-green" : "text-harbor-red"}`}>
                  {formatMoney(week.endingCash)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-3 border-t border-harbor-teal-light px-4 py-4 md:grid-cols-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-harbor-navy/45">Month Starting Checking Cash</p>
          <p className="mt-1 text-lg font-bold text-harbor-navy">{formatMoney(forecast.startingBalance)}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-harbor-navy/45">Cash Inflows</p>
          <p className="mt-1 text-lg font-bold text-harbor-green">{formatMoney(forecast.inflows)}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-harbor-navy/45">Cash Outflows + Card Payments</p>
          <p className="mt-1 text-lg font-bold text-harbor-red">{formatMoney(forecast.outflows)}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-harbor-navy/45">Month-End Checking Cash</p>
          <p className={`mt-1 text-lg font-bold ${forecast.endingBalance >= 0 ? "text-harbor-green" : "text-harbor-red"}`}>
            {formatMoney(forecast.endingBalance)}
          </p>
        </div>
      </div>
    </section>
  );
}
