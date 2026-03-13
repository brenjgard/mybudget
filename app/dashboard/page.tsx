"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  loadSettings,
  loadCCCharges,
  loadAmounts,
} from "../lib/storage";
import { AppSettings, FrequencyType } from "../setup/page";

// ── Buoys (savings goals) ─────────────────────────────────────────────────
type Buoy = { id: string; name: string; current: number; goal: number };
const BUOYS_KEY = "harbor_buoys";
function loadBuoys(): Buoy[] {
  try {
    const raw = localStorage.getItem(BUOYS_KEY);
    return raw ? (JSON.parse(raw) as Buoy[]) : [];
  } catch { return []; }
}
function saveBuoys(buoys: Buoy[]) {
  localStorage.setItem(BUOYS_KEY, JSON.stringify(buoys));
}

function formatMoney(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function formatDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isToday = d.toDateString() === now.toDateString();
  const isYesterday = d.toDateString() === yesterday.toDateString();
  if (isToday) return "Today";
  if (isYesterday) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmtShortDate(d: Date) {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getWeekRanges(year: number, month: number) {
  const weeks: { start: Date; end: Date; label: string }[] = [];
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const firstDayOfWeek = firstDay.getDay();
  const daysToSaturday = firstDayOfWeek === 6 ? 0 : -(firstDayOfWeek + 1);
  let weekStart = new Date(firstDay);
  weekStart.setDate(firstDay.getDate() + daysToSaturday);
  if (weekStart < firstDay) {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    const daysInCurrentMonth =
      Math.round((weekEnd.getTime() - firstDay.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    if (daysInCurrentMonth <= 3) {
      weekStart = new Date(weekStart);
      weekStart.setDate(weekStart.getDate() + 7);
    }
  }
  let current = new Date(weekStart);
  while (true) {
    const start = new Date(current);
    const end = new Date(current);
    end.setDate(end.getDate() + 6);
    if (start > lastDay) break;
    const daysIntoNextMonth = end > lastDay
      ? Math.round((end.getTime() - lastDay.getTime()) / (1000 * 60 * 60 * 24))
      : 0;
    if (daysIntoNextMonth >= 4) break;
    const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    weeks.push({ start, end, label: `${fmt(start)} – ${fmt(end)}` });
    current.setDate(current.getDate() + 7);
  }
  return weeks;
}

function itemAppliesToWeek(
  frequency: FrequencyType,
  weekIdx: number,
  weekStart: Date,
  weekEnd: Date,
  anchorDate?: string,
  anchorMonth?: number,
  month?: number
): boolean {
  switch (frequency) {
    case "every-week":     return true;
    case "twice-a-month":  return weekIdx === 0 || weekIdx === 2;
    case "once-a-month-1": return weekIdx === 0;
    case "once-a-month-2": return weekIdx === 1;
    case "once-a-month-3": return weekIdx === 2;
    case "once-a-month-4": return weekIdx === 3;
    case "week-1":         return weekIdx === 0;
    case "week-2":         return weekIdx === 1;
    case "week-3":         return weekIdx === 2;
    case "week-4":         return weekIdx === 3;
    case "week-5":         return weekIdx === 4;
    case "annually":
      return weekIdx === 0 && (month! + 1) === (anchorMonth ?? 1);
    case "quarterly": {
      const anchor = (anchorMonth ?? 1) - 1;
      const monthsFromAnchor = ((month ?? 0) - anchor + 12) % 12;
      return weekIdx === 0 && monthsFromAnchor % 3 === 0;
    }
    case "every-other-week":
    case "biweekly-odd":
    case "biweekly-even": {
      if (!anchorDate) return weekIdx % 2 === 0;
      const [ay, am, ad] = anchorDate.split("-").map(Number);
      const anchorUTC = Date.UTC(ay, (am ?? 1) - 1, ad ?? 1);
      const anchorDayOfWeek = new Date(anchorUTC).getUTCDay();
      const daysToSat = anchorDayOfWeek === 6 ? 0 : -(anchorDayOfWeek + 1);
      const anchorWeekUTC = anchorUTC + daysToSat * 86400000;
      const ws = weekStart;
      const weekStartUTC = Date.UTC(ws.getFullYear(), ws.getMonth(), ws.getDate());
      const diffDays = Math.round((weekStartUTC - anchorWeekUTC) / 86400000);
      const diffWeeks = Math.round(diffDays / 7);
      return Math.abs(diffWeeks) % 2 === 0;
    }
    default: return false;
  }
}

const BLANK_BUOY = { name: "", current: "", goal: "" };

export default function Dashboard() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;

  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [ccCharges, setCCCharges] = useState<ReturnType<typeof loadCCCharges>>([]);
  const [amounts, setAmounts] = useState<Record<string, Record<number, number>>>({});
  const [buoys, setBuoys] = useState<Buoy[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Buoy form state
  const [showBuoyForm, setShowBuoyForm] = useState(false);
  const [buoyForm, setBuoyForm] = useState(BLANK_BUOY);

  useEffect(() => {
    setSettings(loadSettings());
    setCCCharges(loadCCCharges());
    setAmounts(loadAmounts(monthKey));
    setBuoys(loadBuoys());
    setLoaded(true);
  }, [monthKey]);

  const weeks = useMemo(() => getWeekRanges(year, month), [year, month]);

  // ── Recent Ripples: CC charges sorted by dateMoved desc ───────────────────
  const recentRipples = useMemo(() => {
    return [...ccCharges]
      .sort((a, b) => new Date(b.dateMoved).getTime() - new Date(a.dateMoved).getTime())
      .slice(0, 5);
  }, [ccCharges]);

  // ── Upcoming Waves & Tides: income + expenses in next 14 days ────────────
  const upcomingItems = useMemo(() => {
    if (!settings) return [];
    const todayMs = new Date().setHours(0, 0, 0, 0);
    const in14Ms = todayMs + 14 * 24 * 60 * 60 * 1000;
    const today = new Date(todayMs);
    const in14 = new Date(in14Ms);
    const results: {
      name: string;
      isIncome: boolean;
      amount: number;
      weekStart: Date;
    }[] = [];
    for (let wIdx = 0; wIdx < weeks.length; wIdx++) {
      const week = weeks[wIdx];
      if (week.end < today || week.start > in14) continue;
      for (const item of settings.lineItems) {
        const applies = itemAppliesToWeek(
          item.frequency, wIdx, week.start, week.end,
          item.anchorDate, undefined, month
        );
        if (!applies) continue;
        const overrideAmt = amounts[item.id]?.[wIdx];
        const amt = overrideAmt !== undefined ? overrideAmt : item.defaultAmount;
        results.push({ name: item.name, isIncome: item.isIncome, amount: amt, weekStart: week.start });
      }
    }
    return results.sort((a, b) => a.weekStart.getTime() - b.weekStart.getTime());
  }, [settings, weeks, amounts, month]);

  // ── Insight ───────────────────────────────────────────────────────────────
  const insight = useMemo(() => {
    if (!settings) return null;
    // Find top expense category by total default amount this month
    const catTotals: Record<string, number> = {};
    for (let wIdx = 0; wIdx < weeks.length; wIdx++) {
      const week = weeks[wIdx];
      for (const item of settings.lineItems) {
        if (item.isIncome) continue;
        const applies = itemAppliesToWeek(
          item.frequency, wIdx, week.start, week.end,
          item.anchorDate, undefined, month
        );
        if (!applies) continue;
        const amt = amounts[item.id]?.[wIdx] ?? item.defaultAmount;
        catTotals[item.category] = (catTotals[item.category] ?? 0) + amt;
      }
    }
    const entries = Object.entries(catTotals).sort((a, b) => b[1] - a[1]);
    if (!entries.length) return null;
    const [topCat, topAmt] = entries[0];
    return `Your largest ripple category this month is ${topCat} at ${formatMoney(topAmt)}.`;
  }, [settings, weeks, amounts, month]);

  // ── Buoy handlers ─────────────────────────────────────────────────────────
  function addBuoy() {
    const current = parseFloat(buoyForm.current) || 0;
    const goal = parseFloat(buoyForm.goal) || 0;
    if (!buoyForm.name.trim() || goal <= 0) return;
    const newBuoy: Buoy = {
      id: crypto.randomUUID(),
      name: buoyForm.name.trim(),
      current,
      goal,
    };
    const updated = [...buoys, newBuoy];
    setBuoys(updated);
    saveBuoys(updated);
    setBuoyForm(BLANK_BUOY);
    setShowBuoyForm(false);
  }

  function removeBuoy(id: string) {
    const updated = buoys.filter((b) => b.id !== id);
    setBuoys(updated);
    saveBuoys(updated);
  }

  if (!loaded) {
    return (
      <div className="min-h-screen bg-harbor-offwhite flex items-center justify-center">
        <div className="text-harbor-navy/50 text-sm">Loading...</div>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="min-h-screen bg-harbor-offwhite flex flex-col items-center justify-center gap-4 px-4">
        <div className="text-4xl">⚓</div>
        <h2 className="text-xl font-bold text-harbor-navy">No data yet</h2>
        <p className="text-harbor-navy/60 text-sm text-center max-w-xs">
          Complete setup to see your dashboard.
        </p>
        <Link
          href="/setup"
          className="mt-2 px-6 py-2.5 bg-harbor-teal text-white rounded-lg font-medium text-sm hover:bg-harbor-teal/90 transition-colors"
        >
          Go to Setup
        </Link>
      </div>
    );
  }

  const lastRipple = recentRipples[0] ?? null;

  return (
    <div className="min-h-screen bg-harbor-offwhite">
      <div className="px-4 md:px-8 py-5 flex flex-col gap-4 max-w-[1280px] mx-auto">

        {/* ── Current Position ── */}
        <div className="bg-white rounded-xl border border-slate-200 px-5 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2A9D8F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="5" r="3"/>
              <line x1="12" y1="8" x2="12" y2="21"/>
              <path d="M5 15l7 6 7-6"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            <div>
              <p className="text-harbor-navy/50 text-xs">Current Position</p>
              <p className="text-harbor-navy text-xl font-bold tabular-nums">
                {formatMoney(settings.checkingBalance)}
              </p>
            </div>
          </div>
          {lastRipple && (
            <div className="text-right flex-shrink-0">
              <p className="text-harbor-navy/40 text-xs">Last:</p>
              <p className="text-harbor-red text-sm font-semibold tabular-nums">
                -{formatMoney(lastRipple.amount)}
              </p>
            </div>
          )}
        </div>

        {/* ── Row 1: Recent Ripples | Upcoming Waves & Tides ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

          {/* Recent Ripples */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col">
            <div className="px-5 py-4 flex items-center gap-2.5">
              {/* Trending down icon */}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#E63946" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/>
                <polyline points="17 18 23 18 23 12"/>
              </svg>
              <h2 className="font-bold text-harbor-navy text-base">Recent Ripples</h2>
            </div>

            <div className="flex-1 divide-y divide-slate-100">
              {recentRipples.length === 0 ? (
                <div className="px-5 py-8 text-center">
                  <p className="text-harbor-navy/40 text-sm">No recent charges</p>
                  <p className="text-harbor-navy/30 text-xs mt-1">Close a week on the Dock to log CC charges</p>
                </div>
              ) : (
                recentRipples.map((charge, idx) => (
                  <div key={idx} className="px-5 py-3.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-harbor-navy text-sm font-medium truncate">{charge.itemName}</p>
                      <p className="text-harbor-navy/45 text-xs mt-0.5">{formatDate(charge.dateMoved)}</p>
                    </div>
                    <span className="text-harbor-red text-sm font-semibold flex-shrink-0 tabular-nums">
                      -{formatMoney(charge.amount)}
                    </span>
                  </div>
                ))
              )}
            </div>

            <div className="px-5 py-3.5 border-t border-slate-100">
              <Link href="/" className="w-full block text-center text-harbor-navy text-sm font-medium hover:text-harbor-teal transition-colors">
                View Dock
              </Link>
            </div>
          </div>

          {/* Upcoming Waves & Tides */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col">
            <div className="px-5 py-4 flex items-center gap-2.5">
              {/* Calendar icon */}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2A9D8F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              <h2 className="font-bold text-harbor-navy text-base">Upcoming Waves &amp; Tides</h2>
            </div>

            <div className="flex-1 divide-y divide-slate-100">
              {upcomingItems.length === 0 ? (
                <div className="px-5 py-8 text-center">
                  <p className="text-harbor-navy/60 text-sm font-medium">⛵ All clear ahead</p>
                  <p className="text-harbor-navy/35 text-xs mt-1">Nothing due in the next 14 days</p>
                </div>
              ) : (
                upcomingItems.slice(0, 5).map((item, idx) => (
                  <div key={idx} className="px-5 py-3.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-harbor-navy text-sm font-medium truncate">{item.name}</p>
                      <p className="text-harbor-navy/45 text-xs mt-0.5">{fmtShortDate(item.weekStart)}</p>
                    </div>
                    <span
                      className={`text-sm font-semibold flex-shrink-0 tabular-nums ${
                        item.isIncome ? "text-harbor-green" : "text-harbor-red"
                      }`}
                    >
                      {item.isIncome ? "+" : "-"}{formatMoney(item.amount)}
                    </span>
                  </div>
                ))
              )}
            </div>

            <div className="px-5 py-3.5 border-t border-slate-100">
              <Link href="/" className="w-full block text-center text-harbor-navy text-sm font-medium hover:text-harbor-teal transition-colors">
                View calendar
              </Link>
            </div>
          </div>
        </div>

        {/* ── Row 2: Buoys (Savings Goals) ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2.5">
            {/* Target/buoy icon */}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2A9D8F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <circle cx="12" cy="12" r="6"/>
              <circle cx="12" cy="12" r="2"/>
            </svg>
            <h2 className="font-bold text-harbor-navy text-base">Buoys</h2>
          </div>

          <div className="p-5">
            {buoys.length === 0 && !showBuoyForm ? (
              <div className="py-4 text-center text-harbor-navy/40 text-sm">
                No buoys set yet — add a savings goal below
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5 mb-5">
                {buoys.map((buoy) => {
                  const pct = buoy.goal > 0 ? Math.min(100, Math.round((buoy.current / buoy.goal) * 100)) : 0;
                  return (
                    <div key={buoy.id} className="group">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-harbor-navy text-sm font-medium">{buoy.name}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-harbor-navy/50 text-xs tabular-nums">
                            {formatMoney(buoy.current)} / {formatMoney(buoy.goal)}
                          </span>
                          <button
                            onClick={() => removeBuoy(buoy.id)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-300 hover:text-harbor-red text-xs leading-none"
                            title="Remove"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-harbor-teal rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <p className="text-harbor-navy/40 text-xs mt-1">{pct}% complete</p>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Add new buoy form */}
            {showBuoyForm ? (
              <div className="border border-slate-200 rounded-xl p-4 flex flex-col gap-3">
                <input
                  type="text"
                  placeholder="Goal name (e.g. Emergency Fund)"
                  value={buoyForm.name}
                  onChange={(e) => setBuoyForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-harbor-navy placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-harbor-teal/30"
                />
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="number"
                    placeholder="Current amount"
                    value={buoyForm.current}
                    onChange={(e) => setBuoyForm((f) => ({ ...f, current: e.target.value }))}
                    className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-harbor-navy placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-harbor-teal/30"
                  />
                  <input
                    type="number"
                    placeholder="Goal amount"
                    value={buoyForm.goal}
                    onChange={(e) => setBuoyForm((f) => ({ ...f, goal: e.target.value }))}
                    className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-harbor-navy placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-harbor-teal/30"
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => { setShowBuoyForm(false); setBuoyForm(BLANK_BUOY); }}
                    className="px-4 py-2 text-sm text-harbor-navy/60 hover:text-harbor-navy transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={addBuoy}
                    className="px-4 py-2 bg-harbor-teal text-white rounded-lg text-sm font-medium hover:bg-harbor-teal/90 transition-colors"
                  >
                    Add Buoy
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowBuoyForm(true)}
                className="w-full border border-dashed border-slate-200 rounded-xl py-3 flex items-center justify-center gap-2 text-harbor-navy/50 text-sm hover:border-harbor-teal hover:text-harbor-teal transition-colors"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <circle cx="12" cy="12" r="6"/>
                  <circle cx="12" cy="12" r="2"/>
                </svg>
                Add New Buoy
              </button>
            )}
          </div>
        </div>

        {/* ── Row 3: Insight bar ── */}
        {insight && (
          <div className="bg-blue-50 border border-blue-100 rounded-2xl px-5 py-4 flex items-start gap-3">
            <span className="text-lg flex-shrink-0 mt-0.5">💡</span>
            <p className="text-harbor-navy text-sm">
              <span className="font-semibold">Insight: </span>
              {insight}
            </p>
          </div>
        )}

      </div>
    </div>
  );
}
