"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { budgetRepo } from "../lib/repositories/budget-repo";
import { buildProjectedAmounts } from "../lib/schedule";
import { buildCurrentForwardBudgetSummary, formatMoney, formatShortDate, getCalendarWeeksForMonth, monthKeyFor } from "../lib/harbor-domain";
import { HarborLoading } from "../components/HarborLoading";
import type { SpendLogEntry } from "../lib/types";

type Overview = { balance: number; updatedAt?: string; planned: number; spent: number; remaining: number; logs: SpendLogEntry[]; names: Record<string, string> };
export default function HomePage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const today = new Date(); const year = today.getFullYear(); const month = today.getMonth(); const monthKey = monthKeyFor(year, month);
        const [settings, anchor, savedAmounts, logs, states] = await Promise.all([budgetRepo.loadSettings(), budgetRepo.getCheckingAnchor(), budgetRepo.getMonthlyAmounts(monthKey), budgetRepo.getSpendLogs(monthKey), budgetRepo.getDockItemStates(monthKey)]);
        if (!settings) { window.location.assign("/setup"); return; }
        const weeks = getCalendarWeeksForMonth(year, month);
        const summary = buildCurrentForwardBudgetSummary({ settings, weeks, year, month, amounts: buildProjectedAmounts(settings, weeks, month, savedAmounts), spendLogs: logs, dockStates: states, today });
        if (!cancelled) setOverview({ balance: anchor.balance ?? settings.checkingBalance, updatedAt: anchor.updatedAt, planned: summary.thisWeek.budgeted, spent: summary.thisWeek.spent, remaining: summary.thisWeek.remaining, logs: [...logs].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)).slice(0, 5), names: Object.fromEntries(settings.lineItems.map((item) => [item.id, item.name])) });
      } catch (cause) { if (!cancelled) setError(cause instanceof Error ? cause.message : "Home could not be loaded."); }
    }
    void load(); return () => { cancelled = true; };
  }, []);
  return <main className="harbor-page min-w-0 flex-1 p-3 text-harbor-navy sm:p-6"><div className="mx-auto max-w-5xl space-y-5">
    <header><h1 className="text-2xl font-bold">Home</h1><p className="mt-1 text-sm text-slate-500">Your checking and spending at a glance.</p></header>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {!overview && !error && <HarborLoading label="Loading Home" />}
    {overview && <>
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4"><div><h2 className="text-sm text-slate-500">Checking balance</h2><p className="mt-1 text-3xl font-bold tabular-nums">{formatMoney(overview.balance)}</p><p className="mt-1 text-xs text-slate-500">{overview.updatedAt ? `Updated ${new Date(overview.updatedAt).toLocaleString()}` : "No checking update recorded"}</p></div><Link href="/dock" className="min-h-11 rounded-lg bg-teal-50 px-4 py-3 text-sm font-semibold text-teal-700">Review cash flow &rarr;</Link></section>
      <section className="rounded-xl border border-slate-200 bg-white p-4"><div className="mb-4 flex items-center justify-between"><h2 className="font-bold">This week&apos;s budget</h2><Link href="/budget" className="text-sm font-semibold text-teal-700">View Budget &rarr;</Link></div><dl className="grid grid-cols-3 gap-2">{[["Planned", overview.planned], ["Spent", overview.spent], ["Left", overview.remaining]].map(([label, amount]) => <div key={label}><dt className="text-xs text-slate-500">{label}</dt><dd className={`mt-1 text-sm font-bold tabular-nums sm:text-xl ${Number(amount) < 0 ? "text-red-600" : ""}`}>{formatMoney(Number(amount))}</dd></div>)}</dl></section>
      <div className="grid gap-3 sm:grid-cols-2"><Link href="/fleet" className="rounded-xl border border-slate-200 bg-white p-4"><h2 className="font-bold">Fleet &rarr;</h2><p className="mt-1 text-sm text-slate-500">Review card balances, statements and payments.</p></Link><Link href="/settings" className="rounded-xl border border-slate-200 bg-white p-4"><h2 className="font-bold">Settings &rarr;</h2><p className="mt-1 text-sm text-slate-500">Manage accounts, categories and recurring items.</p></Link></div>
      <section className="rounded-xl border border-slate-200 bg-white p-4"><h2 className="mb-3 font-bold">Recent spending this month</h2>{overview.logs.length ? <ul className="divide-y divide-slate-100">{overview.logs.map((entry) => <li key={entry.id} className="flex items-center justify-between gap-3 py-3 text-sm"><div><p className="font-semibold">{entry.note || overview.names[entry.rippleId] || "Spending"}</p><p className="text-xs text-slate-500">{formatShortDate(new Date(`${entry.date}T00:00:00`))}</p></div><strong className="tabular-nums">{formatMoney(entry.amount)}</strong></li>)}</ul> : <p className="text-sm text-slate-500">No spending recorded this month.</p>}</section>
    </>}
  </div></main>;
}
