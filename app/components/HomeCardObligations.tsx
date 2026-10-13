"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { budgetRepo } from "../lib/repositories/budget-repo";
import { buildProjectedAmounts } from "../lib/schedule";
import { mergeDockEvents } from "../lib/dock-view";
import { buildCardObligations, buildCashEvents, cardCycleForDate, formatMoney, formatShortDate, getCalendarWeeksForMonth, monthKeyFor, parseDateOnly } from "../lib/harbor-domain";
import type { HarborCardObligation } from "../lib/harbor-domain";
import type { AppSettings } from "../lib/types";

export function HomeCardObligations({ settings }: { settings: AppSettings }) {
  const [loadedObligations, setObligations] = useState<HarborCardObligation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setError(null);
      try {
        const today = new Date();
        const cycles = settings.creditCards.map(card => cardCycleForDate(card, parseDateOnly(card.currentBalanceUpdatedAt) ?? today));
        // Include each saved card cycle, its payment month, and moved unresolved records.
        const earliest = await budgetRepo.getEarliestUnresolvedDockMonth();
        const start = new Date(Math.min(today.getTime(), ...cycles.map(cycle => cycle.cycleStart.getTime()), ...(earliest ? [new Date(`${earliest}-01T00:00:00`).getTime()] : [])));
        const end = new Date(Math.max(today.getTime(), ...cycles.map(cycle => cycle.dueDate.getTime())));
        const months: Date[] = [];
        for (const date = new Date(start.getFullYear(), start.getMonth(), 1); date <= end; date.setMonth(date.getMonth() + 1)) months.push(new Date(date));
        const records = await Promise.all(months.map(async date => {
          const month = date.getMonth();
          const monthKey = monthKeyFor(date.getFullYear(), month);
          const weeks = getCalendarWeeksForMonth(date.getFullYear(), month);
          const [amounts, spendLogs, dockStates] = await Promise.all([budgetRepo.getMonthlyAmounts(monthKey), budgetRepo.getSpendLogs(monthKey), budgetRepo.getDockItemStates(monthKey)]);
          return { month, monthKey, weeks, amounts: buildProjectedAmounts(settings, weeks, month, amounts), spendLogs, dockStates };
        }));
        const logs = records.flatMap(record => record.spendLogs);
        const states = records.flatMap(record => record.dockStates);
        const events = mergeDockEvents(records.flatMap(record => buildCashEvents({ ...record, settings, buoys: [], cardSpendLogs: logs, cardPaymentStates: states })), states);
        const result = buildCardObligations(settings, monthKeyFor(today.getFullYear(), today.getMonth()), logs, events).sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
        if (!cancelled) setObligations(result);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Card obligations could not be loaded.");
      }
    }
    if (settings.creditCards.length) void load();
    return () => { cancelled = true; };
  }, [settings, attempt]);

  const obligations = settings.creditCards.length ? loadedObligations : [];
  return <section aria-labelledby="home-card-obligations" className="overflow-hidden rounded-xl border border-slate-200 bg-white">
    <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4">
      <h2 id="home-card-obligations" className="font-bold">Card obligations</h2>
      <Link href="/fleet" className="inline-flex min-h-11 items-center text-sm font-semibold text-teal-700">View Fleet &rarr;</Link>
    </div>
    <p className="px-4 pb-3 text-xs text-slate-500">Projected payments from your saved card balances and spending.</p>
    {error ? <div role="alert" className="mx-4 mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}<button onClick={() => setAttempt(value => value + 1)} className="ml-3 min-h-11 font-semibold underline">Retry</button></div>
      : obligations === null ? <p role="status" className="px-4 pb-4 text-sm text-slate-500">Loading card payments...</p>
      : obligations.length === 0 ? <p className="px-4 pb-4 text-sm text-slate-500">{settings.creditCards.length ? "No card obligations to show." : "Add a card in Fleet to see upcoming payments here."}</p>
      : <ul className="divide-y divide-slate-100">{obligations.map(obligation => <li key={obligation.card.id} className="px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0"><h3 className="break-words text-sm font-semibold">{obligation.card.label}</h3><p className="mt-1 text-xs text-slate-500">Due {formatShortDate(obligation.dueDate)}, {obligation.dueDate.getFullYear()}</p></div>
          <div className="shrink-0 text-right"><p className="text-lg font-bold tabular-nums">{formatMoney(obligation.amount)}</p><p className="text-xs text-slate-500">Projected payment</p></div>
        </div>
        <details className="mt-2 text-xs text-slate-500"><summary className="flex min-h-11 cursor-pointer items-center font-semibold text-teal-700">View calculation</summary><div className="space-y-2 rounded-lg bg-slate-50 p-3"><p>Cycle {formatShortDate(obligation.cycleStart)} &ndash; {formatShortDate(obligation.cycleEnd)}</p><dl className="space-y-2"><div className="flex justify-between gap-3"><dt>Balance assigned to this cycle</dt><dd className="shrink-0 tabular-nums">{formatMoney(obligation.anchorAmount)}</dd></div><div className="flex justify-between gap-3"><dt>New spending</dt><dd className="shrink-0 tabular-nums">{formatMoney(obligation.newSpending)}</dd></div></dl><p>Saved payment adjustments may change this estimate. Review statements and payments in Fleet.</p></div></details>
      </li>)}</ul>}
  </section>;
}
