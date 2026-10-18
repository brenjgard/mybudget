"use client";

import Link from "next/link";
import { HarborLoading } from "../components/HarborLoading";
import { HomeCardObligations } from "../components/HomeCardObligations";
import { useEffect, useState } from "react";
import { budgetRepo } from "../lib/repositories/budget-repo";
import { buildProjectedAmounts } from "../lib/schedule";
import { buildCurrentForwardBudgetSummary, formatMoney, getCalendarWeeksForMonth, monthKeyFor } from "../lib/harbor-domain";
import { HomeChecking } from "../components/HomeChecking";
import type { AppSettings } from "../lib/types";

type Overview = { settings: AppSettings; planned: number; spent: number; remaining: number };
export default function HomePage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setError(null);
        const today = new Date(); const year = today.getFullYear(); const month = today.getMonth(); const monthKey = monthKeyFor(year, month);
        const [settings, savedAmounts, logs, states] = await Promise.all([budgetRepo.loadSettings(), budgetRepo.getMonthlyAmounts(monthKey), budgetRepo.getSpendLogs(monthKey), budgetRepo.getDockItemStates(monthKey)]);
        if (!settings) { window.location.assign("/setup"); return; }
        const weeks = getCalendarWeeksForMonth(year, month);
        const summary = buildCurrentForwardBudgetSummary({ settings, weeks, year, month, amounts: buildProjectedAmounts(settings, weeks, month, savedAmounts), spendLogs: logs, dockStates: states, today });
        if (!cancelled) setOverview({ settings, planned: summary.thisWeek.budgeted, spent: summary.thisWeek.spent, remaining: summary.thisWeek.remaining });
      } catch (cause) { if (!cancelled) setError(cause instanceof Error ? cause.message : "Home could not be loaded."); }
    }
    void load(); return () => { cancelled = true; };
  }, [attempt]);
  const percent = overview && overview.planned > 0 ? Math.round(overview.spent / overview.planned * 100) : 0;
  return <main className="harbor-page home-page min-w-0 flex-1 text-harbor-navy">
    <header className="home-coastal-header"><div className="mx-auto max-w-6xl px-4 py-7 sm:px-8 sm:py-9"><h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Home</h1><p className="mt-2 max-w-xs text-sm text-harbor-navy/80 sm:max-w-md sm:text-base">Your daily snapshot. Update, review, and stay ahead.</p></div></header>
    <div className="mx-auto max-w-6xl space-y-4 px-3 pb-8 sm:space-y-5 sm:px-8">
      {error && <div role="alert" className="home-panel p-4 text-sm text-rose-700">{error}<button onClick={() => setAttempt(value => value + 1)} className="ml-3 min-h-11 font-semibold underline">Retry Home</button></div>}
      <HomeChecking settings={overview?.settings ?? null} />
      <section aria-labelledby="home-budget" className="home-panel p-4 sm:p-6"><div className="flex items-center justify-between gap-3"><h2 id="home-budget" className="text-lg font-bold">This week&apos;s budget</h2><Link href="/budget" className="home-link">View Budget &rarr;</Link></div>
        <dl className="mt-4 grid grid-cols-3 divide-x divide-slate-200">{[["Planned", overview?.planned], ["Spent", overview?.spent], ["Left", overview?.remaining]].map(([label, amount]) => <div key={label} className="min-w-0 px-2 first:pl-0 sm:px-5"><dt className="text-xs text-slate-500">{label}</dt><dd className={"mt-1 text-sm font-bold tabular-nums sm:text-xl " + (Number(amount) < 0 ? "text-rose-700" : "")}>{amount === undefined ? <div className="home-skeleton h-6 w-full" /> : formatMoney(Number(amount))}</dd></div>)}</dl>
        <div className="mt-4 flex items-center gap-3"><div role="progressbar" aria-label="Weekly budget spent" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100,Math.max(0,percent))} className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100"><div className={"h-full rounded-full " + (percent > 100 ? "bg-amber-500" : "bg-harbor-teal")} style={{ width: Math.min(100,Math.max(0,percent)) + "%" }} /></div><span className="text-xs text-slate-500">{overview ? overview.planned > 0 ? percent + "% spent" : "No planned budget" : error ? "Unavailable" : <HarborLoading compact label="Loading budget" />}</span></div>
      </section>
      {overview ? <HomeCardObligations settings={overview.settings} onSettingsChange={settings => setOverview(current => current ? { ...current, settings } : current)} /> : <section className="home-panel p-4 sm:p-6" aria-label="Loading credit cards"><div className="flex items-center justify-between"><h2 className="text-lg font-bold">Credit cards</h2><Link href="/fleet" className="home-link">View Fleet &rarr;</Link></div><p className="mt-1 text-sm text-slate-500">Keep your balances current and see what&apos;s coming up.</p><div className="mt-4 grid gap-3 lg:grid-cols-3">{[0,1,2].map(index => <div key={index} className="rounded-xl border border-slate-100 p-4"><div className="home-skeleton h-4 w-24" /><div className="home-skeleton mt-2 h-6 w-32" /><div className="home-skeleton mt-3 h-10 w-full" /></div>)}</div><div className="mt-4">{error ? <p className="text-xs text-slate-500">Credit cards unavailable</p> : <HarborLoading compact label="Loading credit cards" />}</div><div className="home-skeleton mt-3 h-20 w-full" /></section>}
    </div>
  </main>;
}
