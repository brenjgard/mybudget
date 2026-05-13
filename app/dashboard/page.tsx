"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { EmptyState } from "../components/EmptyState";
import { HelpTooltip } from "../components/HelpTooltip";
import { InfoCallout } from "../components/InfoCallout";
import { loadSettingsWithSupabaseFallback } from "../lib/budget-settings";
import { buildMonthForecast } from "../lib/forecast";
import { helpCopy } from "../lib/help-copy";
import type { Buoy, CCCharge } from "../lib/local-repo";
import { budgetRepo } from "../lib/repositories/budget-repo";
import { getWeekRanges, itemAppliesToWeek } from "../lib/schedule";
import type { AppSettings } from "../lib/types";

function formatMoney(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function formatShortDate(date: Date) {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatRecentDate(iso: string) {
  const date = new Date(iso);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  if (date.toDateString() === now.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const BLANK_BUOY = { name: "", current: "", goal: "" };

export default function Dashboard() {
  const now = useMemo(() => new Date(), []);
  const year = now.getFullYear();
  const month = now.getMonth();
  const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
  const currentMonthKey = monthKey;
  const prevMonthKey = month === 0
    ? `${year - 1}-12`
    : `${year}-${String(month).padStart(2, "0")}`;
  const monthLabel = now.toLocaleString("en-US", { month: "long" });

  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [amounts, setAmounts] = useState<Record<string, Record<number, number>>>({});
  const [monthBalances, setMonthBalances] = useState<Record<string, number>>({});
  const [closedWeeks, setClosedWeeks] = useState<Set<string>>(new Set());
  const [closedMonths, setClosedMonths] = useState<Set<string>>(new Set());
  const [anchorOverride, setAnchorOverride] = useState<number | null>(null);
  const [ccCharges, setCCCharges] = useState<CCCharge[]>([]);
  const [buoys, setBuoys] = useState<Buoy[]>([]);
  const [loaded, setLoaded] = useState(false);

  const [showBuoyForm, setShowBuoyForm] = useState(false);
  const [buoyForm, setBuoyForm] = useState(BLANK_BUOY);

  useEffect(() => {
    let cancelled = false;

    async function loadInitialData() {
      const [
        savedSettings,
        savedAmounts,
        savedMonthBalances,
        savedClosedWeeks,
        savedClosedMonths,
        savedAnchorOverride,
        savedCharges,
        savedBuoys,
      ] = await Promise.all([
        loadSettingsWithSupabaseFallback(),
        budgetRepo.getMonthlyAmounts(monthKey),
        budgetRepo.getMonthBalances(),
        budgetRepo.getClosedWeeks(monthKey),
        budgetRepo.getClosedMonths(),
        budgetRepo.getAnchorOverride(),
        budgetRepo.getCCCharges(),
        budgetRepo.getBuoys(),
      ]);

      if (cancelled) return;
      setSettings(savedSettings);
      setAmounts(savedAmounts);
      setMonthBalances(savedMonthBalances);
      setClosedWeeks(savedClosedWeeks);
      setClosedMonths(savedClosedMonths);
      setAnchorOverride(savedAnchorOverride);
      setCCCharges(savedCharges);
      setBuoys(savedBuoys);
      setLoaded(true);
    }

    loadInitialData();

    return () => {
      cancelled = true;
    };
  }, [monthKey]);

  const weeks = useMemo(() => getWeekRanges(year, month), [year, month]);
  const isMonthClosed = closedMonths.has(monthKey);
  const currentAnchor = anchorOverride ?? settings?.checkingBalance ?? 0;

  const forecast = useMemo(() => {
    if (!settings) return null;

    return buildMonthForecast({
      settings,
      amounts,
      weeks,
      month,
      monthKey,
      currentMonthKey,
      prevMonthKey,
      currentAnchor,
      monthBalances,
      closedWeeks,
      isMonthClosed,
    });
  }, [
    settings,
    amounts,
    weeks,
    month,
    monthKey,
    currentMonthKey,
    prevMonthKey,
    currentAnchor,
    monthBalances,
    closedWeeks,
    isMonthClosed,
  ]);

  const activeWeekIdx = useMemo(() => {
    const idx = weeks.findIndex((week) => now >= week.start && now <= week.end);
    return idx >= 0 ? idx : 0;
  }, [weeks, now]);

  const activeWeek = weeks[activeWeekIdx];
  const wrappedCount = forecast
    ? weeks.filter((_, weekIndex) => forecast.isWeekWrapped(weekIndex)).length
    : 0;

  const upcomingItems = useMemo(() => {
    if (!settings || !forecast) return [];

    const todayMs = new Date().setHours(0, 0, 0, 0);
    const in21DaysMs = todayMs + 21 * 24 * 60 * 60 * 1000;
    const today = new Date(todayMs);
    const in21Days = new Date(in21DaysMs);

    const results: {
      id: string;
      name: string;
      category: string;
      isIncome: boolean;
      amount: number;
      weekIndex: number;
      weekStart: Date;
    }[] = [];

    weeks.forEach((week, weekIndex) => {
      if (forecast.isWeekWrapped(weekIndex) || week.end < today || week.start > in21Days) return;

      settings.lineItems.forEach((item) => {
        const applies = itemAppliesToWeek(
          item.frequency,
          weekIndex,
          week.start,
          week.end,
          item.anchorDate,
          item.anchorMonth,
          month,
        );
        if (!applies) return;

        results.push({
          id: `${item.id}-${weekIndex}`,
          name: item.name,
          category: item.category,
          isIncome: item.isIncome,
          amount: amounts[item.id]?.[weekIndex] ?? item.defaultAmount,
          weekIndex,
          weekStart: week.start,
        });
      });
    });

    return results.sort((a, b) => a.weekStart.getTime() - b.weekStart.getTime());
  }, [settings, forecast, weeks, amounts, month]);

  const upcomingWaves = upcomingItems.filter((item) => item.isIncome).slice(0, 4);
  const upcomingRipples = upcomingItems.filter((item) => !item.isIncome).slice(0, 5);
  const recentCharges = useMemo(() => (
    [...ccCharges]
      .sort((a, b) => new Date(b.dateMoved).getTime() - new Date(a.dateMoved).getTime())
      .slice(0, 4)
  ), [ccCharges]);

  const buoyHighlights = useMemo(() => (
    [...buoys]
      .sort((a, b) => {
        const aPct = a.goal > 0 ? a.current / a.goal : 0;
        const bPct = b.goal > 0 ? b.current / b.goal : 0;
        return aPct - bPct;
      })
      .slice(0, 3)
  ), [buoys]);

  const nextAction = useMemo(() => {
    if (!forecast || weeks.length === 0) {
      return {
        title: "Open Dock",
        body: "Review this month's waves and ripples.",
        href: "/",
        label: "Review Dock",
      };
    }

    if (isMonthClosed) {
      return {
        title: `${monthLabel} is closed`,
        body: "Your final balance is saved. You can review the month in Dock anytime.",
        href: "/",
        label: "View Dock",
      };
    }

    if (!forecast.isWeekWrapped(activeWeekIdx)) {
      return {
        title: `Review Week ${activeWeekIdx + 1}`,
        body: "Check this week's entries and wrap it when real life has caught up.",
        href: "/",
        label: "Review this week",
      };
    }

    if (wrappedCount === weeks.length) {
      return {
        title: `Close ${monthLabel}`,
        body: "All weeks are wrapped. Save the final balance when you are ready.",
        href: "/",
        label: "Close month in Dock",
      };
    }

    const nextOpenWeek = weeks.findIndex((_, weekIndex) => !forecast.isWeekWrapped(weekIndex));
    return {
      title: `Next up: Week ${nextOpenWeek + 1}`,
      body: "The current week is wrapped. Keep an eye on the next open week.",
      href: "/",
      label: "Go to Dock",
    };
  }, [forecast, weeks, isMonthClosed, monthLabel, activeWeekIdx, wrappedCount]);

  async function addBuoy() {
    const current = parseFloat(buoyForm.current) || 0;
    const goal = parseFloat(buoyForm.goal) || 0;
    if (!buoyForm.name.trim() || goal <= 0) return;

    const newBuoy: Buoy = {
      id: crypto.randomUUID(),
      name: buoyForm.name.trim(),
      current,
      goal,
    };
    const savedBuoy = await budgetRepo.saveBuoy(newBuoy);
    setBuoys((currentBuoys) => [...currentBuoys, savedBuoy]);
    setBuoyForm(BLANK_BUOY);
    setShowBuoyForm(false);
  }

  if (!loaded) {
    return (
      <main className="min-h-screen bg-harbor-offwhite flex items-center justify-center">
        <p className="text-sm text-harbor-navy/50">Loading My Harbor...</p>
      </main>
    );
  }

  if (!settings || !forecast) {
    return (
      <main className="min-h-screen bg-harbor-offwhite flex flex-col items-center justify-center gap-4 px-4">
        <h2 className="text-xl font-bold text-harbor-navy">No Harbor plan yet</h2>
        <p className="text-harbor-navy/60 text-sm text-center max-w-xs">
          Complete setup to see where your money is headed.
        </p>
        <Link
          href="/setup"
          className="mt-2 px-6 py-2.5 bg-harbor-teal text-white rounded-lg font-medium text-sm hover:bg-harbor-teal/90 transition-colors"
        >
          Go to Setup
        </Link>
      </main>
    );
  }

  const projectedTone = forecast.displayedForwardBalance >= 0 ? "text-harbor-green" : "text-harbor-red";
  const currentWeekTotal = forecast.weekTotals[activeWeekIdx] ?? 0;

  return (
    <main className="min-h-screen bg-harbor-offwhite text-harbor-navy">
      <div className="mx-auto flex max-w-[1280px] flex-col gap-5 px-4 py-5 md:px-8">
        <section className="rounded-2xl border border-harbor-teal-light bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-harbor-teal">My Harbor</p>
              <h1 className="mt-1 text-2xl font-bold text-harbor-navy md:text-3xl">A calm read on where you stand.</h1>
              <p className="mt-2 max-w-2xl text-sm text-harbor-navy/60">
                Harbor starts from your current Anchor and projects forward through the open weeks in Dock.
              </p>
            </div>
            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-lg bg-harbor-navy px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-harbor-navy/90"
            >
              Open Dock
            </Link>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-slate-100 bg-harbor-offwhite p-4">
              <div className="flex items-center gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-harbor-navy/45">Current Anchor</p>
                <HelpTooltip title={helpCopy.currentAnchor.title}>{helpCopy.currentAnchor.body}</HelpTooltip>
              </div>
              <p className="mt-2 text-2xl font-bold text-harbor-green tabular-nums">{formatMoney(currentAnchor)}</p>
              <p className="mt-1 text-xs text-harbor-navy/55">Your actual checking balance.</p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-harbor-offwhite p-4">
              <div className="flex items-center gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-harbor-navy/45">{forecast.balanceLabel}</p>
                <HelpTooltip title={isMonthClosed ? helpCopy.finalBalance.title : helpCopy.projectedBalance.title}>
                  {isMonthClosed ? helpCopy.finalBalance.body : helpCopy.projectedBalance.body}
                </HelpTooltip>
              </div>
              <p className={`mt-2 text-2xl font-bold tabular-nums ${projectedTone}`}>
                {formatMoney(forecast.displayedForwardBalance)}
              </p>
              <p className="mt-1 text-xs text-harbor-navy/55">
                {isMonthClosed ? "Saved when this month was closed." : "Expected month-end balance."}
              </p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-harbor-offwhite p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-harbor-navy/45">Weekly Status</p>
              <p className="mt-2 text-2xl font-bold text-harbor-navy tabular-nums">{wrappedCount} / {weeks.length}</p>
              <p className="mt-1 text-xs text-harbor-navy/55">
                {wrappedCount === 0
                  ? "No weeks wrapped yet. Wrap a week after it has happened."
                  : `Weeks wrapped for ${monthLabel}.`}
              </p>
            </div>
          </div>
        </section>

        <InfoCallout
          id="dashboard-primer-v1"
          title="A quick Harbor read"
          action={
            <Link
              href="/"
              className="inline-flex rounded-lg bg-harbor-teal px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-harbor-teal/90"
            >
              Review Dock
            </Link>
          }
        >
          Start with your Current Anchor, then Harbor projects forward through open weeks.
          When a week has happened, wrap it so it stops counting as pending.
        </InfoCallout>

        <section className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
          <div className="grid gap-5 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-harbor-teal">This Week</p>
                  <h2 className="mt-1 text-lg font-bold text-harbor-navy">Week {activeWeekIdx + 1}</h2>
                  {activeWeek && <p className="mt-1 text-sm text-harbor-navy/55">{activeWeek.label}</p>}
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                  forecast.isWeekWrapped(activeWeekIdx)
                    ? "bg-harbor-green/10 text-harbor-green"
                    : "bg-harbor-teal-light text-harbor-navy"
                }`}>
                  {forecast.isWeekWrapped(activeWeekIdx) ? "Wrapped" : "Open"}
                </span>
              </div>
              <div className="mt-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-harbor-navy/40">Pending Net</p>
                <p className={`mt-1 text-3xl font-bold tabular-nums ${currentWeekTotal >= 0 ? "text-harbor-green" : "text-harbor-red"}`}>
                  {formatMoney(currentWeekTotal)}
                </p>
                <p className="mt-2 text-sm text-harbor-navy/55">
                  Wrapped weeks are handled and no longer count as pending forecast activity.
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-harbor-teal">Next Action</p>
              <h2 className="mt-1 text-lg font-bold text-harbor-navy">{nextAction.title}</h2>
              <p className="mt-2 text-sm leading-6 text-harbor-navy/60">{nextAction.body}</p>
              <Link
                href={nextAction.href}
                className="mt-5 inline-flex rounded-lg bg-harbor-teal px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-harbor-teal/90"
              >
                {nextAction.label}
              </Link>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-harbor-teal">Attention</p>
                <h2 className="mt-1 text-lg font-bold text-harbor-navy">Buoys</h2>
              </div>
              <Link href="/buoys" className="text-sm font-medium text-harbor-teal hover:text-harbor-navy">
                View all
              </Link>
            </div>

            <div className="mt-4 space-y-4">
              {buoyHighlights.length === 0 ? (
                <EmptyState
                  title="No buoys yet"
                  action={
                    <Link href="/buoys" className="rounded-lg bg-harbor-teal px-3 py-2 text-sm font-medium text-white hover:bg-harbor-teal/90">
                      Add a Buoy
                    </Link>
                  }
                >
                  Buoys are optional savings goals or attention points you want to keep visible.
                </EmptyState>
              ) : (
                buoyHighlights.map((buoy) => {
                  const pct = buoy.goal > 0 ? Math.min(100, Math.round((buoy.current / buoy.goal) * 100)) : 0;
                  return (
                    <div key={buoy.id}>
                      <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                        <span className="font-medium text-harbor-navy">{buoy.name}</span>
                        <span className="text-xs text-harbor-navy/50">{pct}%</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-harbor-teal" style={{ width: `${pct}%` }} />
                      </div>
                      <p className="mt-1 text-xs text-harbor-navy/45">
                        {formatMoney(buoy.current)} of {formatMoney(buoy.goal)}
                      </p>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-2">
          <DashboardList
            title="Upcoming Waves"
            emptyTitle="No upcoming income"
            empty="Add Income (Waves) so Harbor can see money coming in."
            action={<Link href="/settings#waves" className="rounded-lg bg-harbor-green px-3 py-2 text-sm font-medium text-white hover:bg-harbor-green/90">Add Income</Link>}
            items={upcomingWaves.map((item) => ({
              id: item.id,
              name: item.name,
              meta: `Week ${item.weekIndex + 1} - ${formatShortDate(item.weekStart)}`,
              amount: `+${formatMoney(item.amount)}`,
              tone: "green" as const,
            }))}
          />
          <DashboardList
            title="Upcoming Ripples"
            emptyTitle="No upcoming bills or spending"
            empty="Add Bills & Spending (Ripples) to plan around what is going out."
            action={<Link href="/settings#ripples" className="rounded-lg bg-harbor-red px-3 py-2 text-sm font-medium text-white hover:bg-harbor-red/90">Add Spending</Link>}
            items={upcomingRipples.map((item) => ({
              id: item.id,
              name: item.name,
              meta: `${item.category} - Week ${item.weekIndex + 1}`,
              amount: `-${formatMoney(item.amount)}`,
              tone: "red" as const,
            }))}
          />
        </section>

        <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.6fr)]">
          <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-harbor-teal">Recent</p>
                <h2 className="mt-1 text-lg font-bold text-harbor-navy">Card Ripples</h2>
              </div>
              <Link href="/" className="text-sm font-medium text-harbor-teal hover:text-harbor-navy">
                Dock
              </Link>
            </div>
            <div className="mt-4 divide-y divide-slate-100">
              {recentCharges.length === 0 ? (
                <EmptyState title="No wrapped card spending yet">
                  When you wrap a week, credit card spending moves into the next month&apos;s card payment.
                </EmptyState>
              ) : (
                recentCharges.map((charge, index) => (
                  <div key={`${charge.itemId}-${charge.dateMoved}-${index}`} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-harbor-navy">{charge.itemName}</p>
                      <p className="text-xs text-harbor-navy/45">{charge.cardLabel} - {formatRecentDate(charge.dateMoved)}</p>
                    </div>
                    <span className="text-sm font-semibold text-harbor-red tabular-nums">-{formatMoney(charge.amount)}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-harbor-teal">Quick Buoy</p>
            <h2 className="mt-1 text-lg font-bold text-harbor-navy">Add a goal</h2>
            {showBuoyForm ? (
              <div className="mt-4 space-y-3">
                <input
                  type="text"
                  placeholder="Goal name"
                  value={buoyForm.name}
                  onChange={(event) => setBuoyForm((form) => ({ ...form, name: event.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-harbor-navy placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-harbor-teal/30"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    placeholder="Current"
                    value={buoyForm.current}
                    onChange={(event) => setBuoyForm((form) => ({ ...form, current: event.target.value }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-harbor-navy placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-harbor-teal/30"
                  />
                  <input
                    type="number"
                    placeholder="Goal"
                    value={buoyForm.goal}
                    onChange={(event) => setBuoyForm((form) => ({ ...form, goal: event.target.value }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-harbor-navy placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-harbor-teal/30"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => { setShowBuoyForm(false); setBuoyForm(BLANK_BUOY); }}
                    className="rounded-lg px-3 py-2 text-sm font-medium text-harbor-navy/60 hover:text-harbor-navy"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void addBuoy()}
                    className="rounded-lg bg-harbor-teal px-3 py-2 text-sm font-medium text-white hover:bg-harbor-teal/90"
                  >
                    Add Buoy
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowBuoyForm(true)}
                className="mt-4 w-full rounded-xl border border-dashed border-slate-200 py-3 text-sm font-medium text-harbor-navy/50 transition-colors hover:border-harbor-teal hover:text-harbor-teal"
              >
                Add New Buoy
              </button>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function DashboardList({
  title,
  emptyTitle,
  empty,
  action,
  items,
}: {
  title: string;
  emptyTitle: string;
  empty: string;
  action?: React.ReactNode;
  items: { id: string; name: string; meta: string; amount: string; tone: "green" | "red" }[];
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-bold text-harbor-navy">{title}</h2>
      <div className="mt-4 divide-y divide-slate-100">
        {items.length === 0 ? (
          <EmptyState title={emptyTitle} action={action}>
            {empty}
          </EmptyState>
        ) : (
          items.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-harbor-navy">{item.name}</p>
                <p className="text-xs text-harbor-navy/45">{item.meta}</p>
              </div>
              <span className={`text-sm font-semibold tabular-nums ${item.tone === "green" ? "text-harbor-green" : "text-harbor-red"}`}>
                {item.amount}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
