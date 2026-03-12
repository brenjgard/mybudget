"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  loadSettings, loadAmounts, saveAmounts,
  loadMonthBalances, saveMonthBalances,
  loadCCCharges, saveCCCharges, CCCharge,
} from "./lib/storage";
import { AppSettings, FrequencyType, LineItem } from "./setup/page";

function formatMoney(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function getWeekRanges(year: number, month: number) {
  const weeks: { start: Date; end: Date; label: string }[] = [];
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  // Find the Saturday on or before the 1st
  const firstDayOfWeek = firstDay.getDay(); // 0=Sun, 6=Sat
  const daysToSaturday = firstDayOfWeek === 6 ? 0 : -(firstDayOfWeek + 1);
  let weekStart = new Date(firstDay);
  weekStart.setDate(firstDay.getDate() + daysToSaturday);

  // If this Saturday belongs to the previous month, check if the
  // previous month would have claimed it (bled <=3 days into this month)
  if (weekStart < firstDay) {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    const daysIntoThisMonth = Math.round(
      (weekEnd.getTime() - lastDay.getTime()) / (1000 * 60 * 60 * 24)
    );
    // How many days of this week fall in the current month
    const daysInCurrentMonth = Math.round(
      (weekEnd.getTime() - firstDay.getTime()) / (1000 * 60 * 60 * 24)
    ) + 1;

    // Previous month claims this week if it bleeds <=3 days into this month
    // meaning >=4 days of the week are in the previous month
    if (daysInCurrentMonth <= 3) {
      // Previous month owns this week, start on next Saturday
      weekStart = new Date(weekStart);
      weekStart.setDate(weekStart.getDate() + 7);
    }
  }

  let current = new Date(weekStart);

  while (true) {
    const start = new Date(current);
    const end = new Date(current);
    end.setDate(end.getDate() + 6);

    // Stop if this week starts after the last day of the month
    if (start > lastDay) break;

    // How many days bleed into next month?
    const daysIntoNextMonth = end > lastDay
      ? Math.round((end.getTime() - lastDay.getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    // If it bleeds 4+ days into next month, it belongs to next month
    if (daysIntoNextMonth >= 4) break;

    const fmt = (d: Date) =>
      d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

    weeks.push({
      start,
      end,
      label: `${fmt(start)} – ${fmt(end)}`,
    });

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
    case "every-week":       return true;
    case "twice-a-month":    return weekIdx === 0 || weekIdx === 2;
    case "once-a-month-1":   return weekIdx === 0;
    case "once-a-month-2":   return weekIdx === 1;
    case "once-a-month-3":   return weekIdx === 2;
    case "once-a-month-4":   return weekIdx === 3;
    case "week-1":           return weekIdx === 0;
    case "week-2":           return weekIdx === 1;
    case "week-3":           return weekIdx === 2;
    case "week-4":           return weekIdx === 3;
    case "week-5":           return weekIdx === 4;
    case "annually":
      return weekIdx === 0 && (month! + 1) === (anchorMonth ?? 1);
    case "quarterly": {
      const anchor = (anchorMonth ?? 1) - 1; // 0-indexed
      const monthsFromAnchor = ((month ?? 0) - anchor + 12) % 12;
      return weekIdx === 0 && monthsFromAnchor % 3 === 0;
    }
    case "every-other-week":
    case "biweekly-odd":
    case "biweekly-even": {
      if (!anchorDate) return weekIdx % 2 === 0;
      // Use UTC dates to completely avoid DST issues
      const [ay, am, ad] = anchorDate.split("-").map(Number);
      // Find Saturday on or before anchor date using UTC
      const anchorUTC = Date.UTC(ay, (am ?? 1) - 1, ad ?? 1);
      const anchorDayOfWeek = new Date(anchorUTC).getUTCDay(); // 0=Sun, 6=Sat
      const daysToSat = anchorDayOfWeek === 6 ? 0 : -(anchorDayOfWeek + 1);
      const anchorWeekUTC = anchorUTC + daysToSat * 86400000;

      // Get this week's start in UTC
      const ws = weekStart;
      const weekStartUTC = Date.UTC(ws.getFullYear(), ws.getMonth(), ws.getDate());

      // Difference in days (whole number, no DST)
      const diffDays = Math.round((weekStartUTC - anchorWeekUTC) / 86400000);
      const diffWeeks = Math.round(diffDays / 7);

       return Math.abs(diffWeeks) % 2 === 0;
    }
    default: return false;
  }
}

export default function Home() {
  const router = useRouter();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [currentBalance, setCurrentBalance] = useState(0);
  const [amounts, setAmounts] = useState<Record<string, Record<number, number>>>({});
  const [loaded, setLoaded] = useState(false);
  const [autoFill, setAutoFill] = useState(false);
  const [monthBalances, setMonthBalances] = useState<Record<string, number>>({});

  // ── Feature 1: Collapsible categories ────────────────────────────────────
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  // ── Feature 5: Close Week tracking ───────────────────────────────────────
  const [closedWeeks, setClosedWeeks] = useState<Set<string>>(new Set());
  const [activeWeekIdx, setActiveWeekIdx] = useState(0);

  // cardLookup available before early return (used in closeWeek)
  const cardLookup = useMemo(
    () => Object.fromEntries((settings?.creditCards ?? []).map((c) => [c.id, c.label])),
    [settings]
  );

  // ── All derived month keys ────────────────────────────────────────────────
  const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
  const prevMonthKey = month === 0
    ? `${year - 1}-12`
    : `${year}-${String(month).padStart(2, "0")}`;

  // Load on mount
  useEffect(() => {
    const s = loadSettings();
    if (!s) { router.push("/setup"); return; }
    setSettings(s);
    setCurrentBalance(s.checkingBalance);
    setAmounts(loadAmounts(monthKey));
    setMonthBalances(loadMonthBalances());
    setLoaded(true);
    setAutoFill(true);
  }, []);

  // Save amounts whenever they change
  useEffect(() => {
    if (loaded) saveAmounts(amounts, monthKey);
  }, [amounts, loaded]);

  const weeks = useMemo(() => getWeekRanges(year, month), [year, month]);

  // Auto fill defaults on load
  useEffect(() => {
    if (!settings || !loaded) return;
    const currentMonthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
    const saved = loadAmounts(currentMonthKey);
    const next: Record<string, Record<number, number>> = {};
    for (const item of settings.lineItems) {
      next[item.id] = next[item.id] ?? {};
      weeks.forEach((_, wi) => {
        if (itemAppliesToWeek(item.frequency, wi, weeks[wi].start, weeks[wi].end, item.anchorDate, item.anchorMonth, month)) {
          const savedVal = saved[item.id]?.[wi];
          if (savedVal !== undefined) {
            // Always preserve saved values — never overwrite with defaults
            next[item.id][wi] = savedVal;
          } else if (item.defaultAmount > 0) {
            next[item.id][wi] = item.defaultAmount;
          }
        } else {
          // Preserve saved values even for weeks the item doesn't apply to
          // This protects CC payment amounts written by closeWeek
          if (saved[item.id]?.[wi] !== undefined) {
            next[item.id][wi] = saved[item.id][wi];
          }
        }
      });
    }
    setAmounts(next);
  }, [year, month, settings, loaded]);

  // Auto-set active week to current week on mobile
  useEffect(() => {
    if (weeks.length === 0) return;
    const today = new Date();
    if (year === today.getFullYear() && month === today.getMonth()) {
      const idx = weeks.findIndex((w) => today >= w.start && today <= w.end);
      setActiveWeekIdx(idx >= 0 ? idx : 0);
    } else {
      setActiveWeekIdx(0);
    }
  }, [year, month, weeks.length]);

  const startingBalance = monthBalances[prevMonthKey] ?? currentBalance;

  const weekTotals = useMemo(() => {
    if (!settings) return [];
    return weeks.map((_, wi) => {
      let net = 0;
      for (const item of settings.lineItems) {
        if (!itemAppliesToWeek(item.frequency, wi, weeks[wi].start, weeks[wi].end, item.anchorDate, item.anchorMonth, month)) continue;
        const n = amounts[item.id]?.[wi] ?? 0;
        if (item.isIncome) net += n;
        else net -= n;
      }
      return net;
    });
  }, [amounts, weeks, settings, month]);

  const projectedBalances = useMemo(() => {
    let running = startingBalance;
    return weekTotals.map((t) => {
      running += t;
      return running;
    });
  }, [startingBalance, weekTotals]);

  const creditTotals = useMemo(() => {
    if (!settings) return [];
    return weeks.map((_, wi) => {
      const byCard: Record<string, number> = {};
      for (const item of settings.lineItems) {
        if (item.isIncome || item.paymentMethod === "checking") continue;
        if (!itemAppliesToWeek(item.frequency, wi, weeks[wi].start, weeks[wi].end, item.anchorDate, item.anchorMonth, month)) continue;
        const n = amounts[item.id]?.[wi] ?? 0;
        byCard[item.paymentMethod] = (byCard[item.paymentMethod] ?? 0) + n;
      }
      return byCard;
    });
  }, [amounts, weeks, settings, month]);

  // Category totals per week — used by collapsed rows
  const categoryWeekTotals = useMemo(() => {
    if (!settings) return {} as Record<string, number[]>;
    const result: Record<string, number[]> = {};
    for (const cat of settings.categories) {
      const catItems = settings.lineItems.filter((i) => i.category === cat);
      result[cat] = weeks.map((_, wi) => {
        let total = 0;
        for (const item of catItems) {
          if (!itemAppliesToWeek(item.frequency, wi, weeks[wi].start, weeks[wi].end, item.anchorDate, item.anchorMonth, month)) continue;
          total += amounts[item.id]?.[wi] ?? 0;
        }
        return total;
      });
    }
    return result;
  }, [amounts, weeks, settings, month]);

  // Save ending balance for this month whenever projectedBalances changes
  useEffect(() => {
    if (!loaded || projectedBalances.length === 0) return;
    const endingBalance = projectedBalances[projectedBalances.length - 1];
    const updated = { ...monthBalances, [monthKey]: endingBalance };
    setMonthBalances(updated);
    saveMonthBalances(updated);
  }, [projectedBalances, loaded, monthKey]);

  function getAmount(itemId: string, weekIdx: number): number | "" {
    return amounts[itemId]?.[weekIdx] ?? "";
  }

  function setAmount(itemId: string, weekIdx: number, val: number | "") {
    setAmounts((prev) => ({
      ...prev,
      [itemId]: { ...(prev[itemId] ?? {}), [weekIdx]: val === "" ? 0 : val },
    }));
  }

function prevMonth() {
    const prevDate = month === 0
      ? new Date(year - 1, 11, 1)
      : new Date(year, month - 1, 1);
    const oneMonthAgo = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    if (prevDate < oneMonthAgo) return; // block going too far back
    if (month === 0) { setMonth(11); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  }

  function toggleCategory(cat: string) {
    setCollapsed((prev) => ({ ...prev, [cat]: !prev[cat] }));
  }

  // ── Feature 5: Close Week CC flow ─────────────────────────────────────────
  function closeWeek(card: { id: string; label: string }, wi: number) {
    if (!settings) return;

    // Collect all line items charged to this card that apply this week
    const chargeItems = settings.lineItems.filter(
      (item) =>
        !item.isIncome &&
        item.paymentMethod === card.id &&
        itemAppliesToWeek(item.frequency, wi, weeks[wi].start, weeks[wi].end, item.anchorDate, item.anchorMonth, month)
    );
    const total = chargeItems.reduce((sum, item) => sum + (amounts[item.id]?.[wi] ?? 0), 0);

    // Save each individual charge to the CC ledger
    const newCharges: CCCharge[] = chargeItems
      .filter((item) => (amounts[item.id]?.[wi] ?? 0) > 0)
      .map((item) => ({
        itemId: item.id,
        itemName: item.name,
        card: card.id,
        cardLabel: card.label,
        amount: amounts[item.id]?.[wi] ?? 0,
        weekLabel: weeks[wi].label,
        dateMoved: new Date().toISOString(),
      }));
    if (newCharges.length > 0) {
      saveCCCharges([...loadCCCharges(), ...newCharges]);
    }

    // Find the CC payment line item for this card and roll total into next month week 3
    if (total > 0) {
      const nextMonthKey =
        month === 11
          ? `${year + 1}-01`
          : `${year}-${String(month + 2).padStart(2, "0")}`;
      const nextAmounts = loadAmounts(nextMonthKey);
      const item = settings.lineItems.find(
        (i) =>
          i.category === "Credit Cards" &&
          i.paymentMethod === "checking" &&
          i.name.toLowerCase().includes(card.label.toLowerCase())
      );
      if (item) {
        const existing = nextAmounts[item.id]?.[2] ?? 0;
        const newTotal = existing + total;
        saveAmounts(
          { ...nextAmounts, [item.id]: { ...nextAmounts[item.id], 2: newTotal } },
          nextMonthKey
        );
      }
    }

    // Mark week as closed
    setClosedWeeks((prev) => new Set(prev).add(`${year}-${month}-${card.id}-${wi}`));
  }

  const monthName = new Date(year, month).toLocaleString("en-US", { month: "long", year: "numeric" });

  if (!loaded || !settings) {
    return (
      <main className="flex-1 bg-harbor-offwhite flex items-center justify-center">
        <p className="text-harbor-navy/50">Loading your budget...</p>
      </main>
    );
  }

  return (
    <main className="flex-1 bg-harbor-offwhite text-slate-900 p-4">
      <div className="max-w-[1400px] mx-auto space-y-4">

        {/* Page controls */}
        <div className="flex flex-col items-center md:flex-row md:flex-wrap md:justify-between gap-4 bg-white rounded-2xl p-4 shadow-sm border border-harbor-teal-light">

          {/* Month navigation */}
          <div className="flex items-center gap-2">
            <button
              onClick={prevMonth}
              className="px-3 py-2 rounded-lg bg-harbor-teal-light hover:bg-harbor-teal/20 text-harbor-navy font-bold transition-colors"
            >
              ←
            </button>
            <span className="font-bold text-lg w-48 text-center text-harbor-navy">{monthName}</span>
            <button
              onClick={nextMonth}
              className="px-3 py-2 rounded-lg bg-harbor-teal-light hover:bg-harbor-teal/20 text-harbor-navy font-bold transition-colors"
            >
              →
            </button>
          </div>

          {/* Balance controls */}
          <div className="flex items-center gap-4">
            <div className="text-right">
              <label className="text-xs text-slate-400 block">Anchor</label>
              <span className={`font-semibold text-lg ${startingBalance >= 0 ? "text-harbor-green" : "text-harbor-red"}`}>
                {formatMoney(startingBalance)}
              </span>
            </div>
            <div className="hidden md:block text-right">
              <label className="text-xs text-slate-400 block">Override Balance</label>
              <input
                type="number"
                className="border-2 border-harbor-teal-light focus:border-harbor-teal rounded-lg px-3 py-2 w-36 text-right font-semibold text-slate-600 focus:outline-none transition-colors"
                value={currentBalance}
                onChange={(e) => setCurrentBalance(Number(e.target.value))}
              />
            </div>
          </div>

        </div>

        {/* Budget table — desktop only */}
        <div className="hidden md:block bg-white rounded-2xl shadow-sm overflow-x-auto border border-harbor-teal-light">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-harbor-navy text-white">
                <th className="text-left px-3 py-3 w-28 sticky left-0 bg-harbor-navy">Category</th>
                <th className="text-left px-3 py-3 w-44 sticky left-28 bg-harbor-navy">Item</th>
                <th className="text-center px-2 py-3 w-24">Method</th>
                {weeks.map((w, i) => (
                  <th key={i} className="text-center px-2 py-3 min-w-[130px]">
                    <div className="text-xs font-normal opacity-60">Week {i + 1}</div>
                    <div className="text-xs font-medium">{w.label}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {settings.categories.map((cat) => {
                const items = settings.lineItems.filter((i) => i.category === cat);
                if (items.length === 0) return null;

                const isCollapsed = collapsed[cat] ?? false;
                const catTotals = categoryWeekTotals[cat] ?? [];

                // ── Collapsed: single summary row ──────────────────────────
                if (isCollapsed) {
                  return (
                    <tr
                      key={`${cat}-collapsed`}
                      onClick={() => toggleCategory(cat)}
                      className="border-t-2 border-harbor-teal/20 border-b border-slate-100 cursor-pointer hover:bg-harbor-offwhite"
                    >
                      <td className="px-3 py-3 bg-harbor-teal-light sticky left-0 border-r border-harbor-teal/20">
                        <div className="flex items-center gap-1.5">
                          <span className="text-harbor-teal text-xs">▶</span>
                          <span className="font-semibold text-harbor-navy text-xs uppercase tracking-wide">{cat}</span>
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5 pl-4">
                          {items.length} item{items.length !== 1 ? "s" : ""}
                        </div>
                      </td>
                      <td className="px-3 py-3 sticky left-28 bg-harbor-teal-light border-r border-slate-100 text-xs text-slate-400 italic">
                        {items.length} item{items.length !== 1 ? "s" : ""}
                      </td>
                      <td className="px-2 py-3" />
                      {catTotals.map((total, wi) => (
                        <td key={wi} className="px-2 py-3 text-center">
                          {total > 0 ? (
                            <span className="text-sm font-semibold text-slate-600">{formatMoney(total)}</span>
                          ) : (
                            <span className="text-slate-200 text-xs">—</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  );
                }

                // ── Expanded: all line item rows ────────────────────────────
                return items.map((item, idx) => (
                  <tr
                    key={item.id}
                    className={`border-b border-slate-100 hover:bg-harbor-offwhite ${idx === 0 ? "border-t-2 border-harbor-teal/20" : ""}`}
                  >
                    {idx === 0 && (
                      <td
                        rowSpan={items.length}
                        onClick={() => toggleCategory(cat)}
                        className="px-3 py-2 font-semibold text-harbor-navy bg-harbor-teal-light sticky left-0 border-r border-harbor-teal/20 text-xs uppercase tracking-wide align-top pt-3 cursor-pointer select-none"
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="text-harbor-teal">▼</span>
                          <span>{cat}</span>
                        </div>
                      </td>
                    )}
                    <td className="px-3 py-2 sticky left-28 bg-white border-r border-slate-100">
                      {item.name}
                      {item.isIncome && <span className="ml-1 text-xs text-harbor-green font-medium">↑</span>}
                    </td>
                    <td className="px-2 py-2 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        item.paymentMethod === "checking"
                          ? "bg-harbor-teal/15 text-harbor-teal"
                          : "bg-harbor-navy/10 text-harbor-navy"
                      }`}>
                        {item.paymentMethod === "checking"
                          ? "CHK"
                          : cardLookup[item.paymentMethod] ?? item.paymentMethod}
                      </span>
                    </td>
                    {weeks.map((_, wi) => {
                      const applies = itemAppliesToWeek(item.frequency, wi, weeks[wi].start, weeks[wi].end, item.anchorDate, item.anchorMonth, month);
                      const val = getAmount(item.id, wi);
                      return (
                        <td key={wi} className="px-2 py-1 text-center">
                          {applies ? (
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              placeholder="—"
                              value={val === 0 ? "" : val}
                              onChange={(e) => setAmount(item.id, wi, e.target.value === "" ? "" : Number(e.target.value))}
                              className={`w-24 text-right rounded-lg border px-2 py-1 text-sm focus:outline-none focus:ring-2
                                ${item.isIncome
                                  ? "text-harbor-green border-l-2 border-l-harbor-green border-slate-200 focus:ring-harbor-teal/20"
                                  : "text-harbor-red border-l-2 border-l-harbor-red border-slate-200 focus:ring-harbor-red/20"}`}
                            />
                          ) : (
                            <span className="text-slate-200 text-xs">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ));
              })}

              {/* Summary section header */}
              <tr className="bg-harbor-teal-light/50">
                <td colSpan={3 + weeks.length} className="px-3 py-1 text-xs text-harbor-navy/50 uppercase tracking-wide font-semibold">
                  Summary
                </td>
              </tr>

              {/* Credit card totals with Close Week */}
              {settings.creditCards.map((card) => (
                <tr key={card.id} className="bg-harbor-navy/5 font-semibold">
                  <td className="px-3 py-2 sticky left-0 bg-harbor-navy/5 text-xs uppercase tracking-wide text-harbor-navy" colSpan={2}>
                    {card.label}
                  </td>
                  <td />
                  {creditTotals.map((byCard, wi) => {
                    const total = byCard[card.id] ?? 0;
                    const closeKey = `${year}-${month}-${card.id}-${wi}`;
                    return (
                      <td key={wi} className="px-2 py-2 text-center text-harbor-navy">
                        {total > 0 ? (
                          closedWeeks.has(closeKey) ? (
                            <span className="text-xs text-harbor-green font-medium">✓ Closed</span>
                          ) : (
                            <div className="inline-flex flex-col items-center gap-0.5">
                              <span>{formatMoney(total)}</span>
                              <button
                                onClick={() => closeWeek(card, wi)}
                                className="text-xs text-harbor-navy/40 hover:text-harbor-teal transition-colors leading-none"
                              >
                                Close Week
                              </button>
                            </div>
                          )
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}

              {/* Week net */}
              <tr className="bg-harbor-teal-light font-semibold">
                <td className="px-3 py-2 sticky left-0 bg-harbor-teal-light text-xs uppercase tracking-wide text-harbor-navy" colSpan={2}>
                  Week Net
                </td>
                <td />
                {weekTotals.map((t, i) => (
                  <td key={i} className={`px-2 py-2 text-center font-bold ${t >= 0 ? "text-harbor-green" : "text-harbor-red"}`}>
                    {formatMoney(t)}
                  </td>
                ))}
              </tr>

              {/* Projected balance */}
              <tr className="bg-harbor-navy text-white font-bold">
                <td className="px-3 py-3 sticky left-0 bg-harbor-navy text-xs uppercase tracking-wide" colSpan={2}>
                  Projected Balance
                </td>
                <td />
                {projectedBalances.map((b, i) => (
                  <td key={i} className={`px-2 py-3 text-center text-base ${b >= 0 ? "text-harbor-green" : "text-harbor-red"}`}>
                    {formatMoney(b)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>

        {/* Mobile card view — visible only below md */}
        {weeks.length > 0 && (
          <div className="block md:hidden space-y-3">

            {/* Week navigation */}
            <div className="flex items-center justify-between bg-harbor-navy text-white rounded-2xl px-4 py-3">
              <button
                onClick={() => setActiveWeekIdx((i) => Math.max(0, i - 1))}
                disabled={activeWeekIdx === 0}
                className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-30 font-bold transition-colors"
              >
                ←
              </button>
              <div className="text-center">
                <div className="text-xs opacity-60">Week {activeWeekIdx + 1} of {weeks.length}</div>
                <div className="text-sm font-medium">{weeks[activeWeekIdx].label}</div>
              </div>
              <button
                onClick={() => setActiveWeekIdx((i) => Math.min(weeks.length - 1, i + 1))}
                disabled={activeWeekIdx === weeks.length - 1}
                className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-30 font-bold transition-colors"
              >
                →
              </button>
            </div>

            {/* Category cards */}
            {settings.categories.map((cat) => {
              const items = settings.lineItems.filter((i) => i.category === cat);
              const applicableItems = items.filter((item) =>
                itemAppliesToWeek(
                  item.frequency,
                  activeWeekIdx,
                  weeks[activeWeekIdx].start,
                  weeks[activeWeekIdx].end,
                  item.anchorDate,
                  item.anchorMonth,
                  month
                )
              );
              if (applicableItems.length === 0) return null;
              return (
                <div key={cat} className="bg-white rounded-2xl shadow-sm border border-harbor-teal-light overflow-hidden">
                  <div className="bg-harbor-teal-light px-4 py-2">
                    <span className="font-semibold text-harbor-navy text-xs uppercase tracking-wide">{cat}</span>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {applicableItems.map((item) => {
                      const val = getAmount(item.id, activeWeekIdx);
                      const displayVal = val !== "" && Number(val) !== 0 ? formatMoney(Number(val)) : "—";
                      return (
                        <div key={item.id} className="flex items-center justify-between px-4 py-2.5">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="text-sm text-slate-700 truncate">{item.name}</span>
                            {item.isIncome && <span className="text-xs text-harbor-green font-medium flex-shrink-0">↑</span>}
                          </div>
                          <span className={`text-sm font-semibold flex-shrink-0 ml-2 ${item.isIncome ? "text-harbor-green" : "text-harbor-red"}`}>
                            {displayVal}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* Summary card */}
            <div className="bg-white rounded-2xl shadow-sm border border-harbor-teal-light overflow-hidden">
              <div className="bg-harbor-teal-light px-4 py-2">
                <span className="font-semibold text-harbor-navy text-xs uppercase tracking-wide">Summary</span>
              </div>
              <div className="divide-y divide-slate-100">
                {settings.creditCards.map((card) => {
                  const total = creditTotals[activeWeekIdx]?.[card.id] ?? 0;
                  if (total === 0) return null;
                  const closeKey = `${year}-${month}-${card.id}-${activeWeekIdx}`;
                  return (
                    <div key={card.id} className="flex items-center justify-between px-4 py-2.5">
                      <span className="text-sm font-semibold text-harbor-navy">{card.label}</span>
                      {closedWeeks.has(closeKey) ? (
                        <span className="text-xs text-harbor-green font-medium">✓ Closed</span>
                      ) : (
                        <span className="text-sm font-semibold text-harbor-navy">{formatMoney(total)}</span>
                      )}
                    </div>
                  );
                })}
                <div className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-sm font-semibold text-harbor-navy uppercase tracking-wide">Week Net</span>
                  <span className={`text-sm font-bold ${(weekTotals[activeWeekIdx] ?? 0) >= 0 ? "text-harbor-green" : "text-harbor-red"}`}>
                    {formatMoney(weekTotals[activeWeekIdx] ?? 0)}
                  </span>
                </div>
                <div className="flex items-center justify-between px-4 py-3 bg-harbor-navy rounded-b-2xl">
                  <span className="text-sm font-bold text-white uppercase tracking-wide">Projected Balance</span>
                  <span className={`text-base font-bold ${(projectedBalances[activeWeekIdx] ?? 0) >= 0 ? "text-harbor-green" : "text-harbor-red"}`}>
                    {formatMoney(projectedBalances[activeWeekIdx] ?? 0)}
                  </span>
                </div>
              </div>
            </div>

          </div>
        )}

      </div>
    </main>
  );
}
