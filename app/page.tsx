"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { localRepo, type CCCharge } from "./lib/local-repo";
import { getWeekRanges, itemAppliesToWeek } from "./lib/schedule";
import { AppSettings } from "./lib/types";

function formatMoney(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
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
    const s = localRepo.loadSettings();
    if (!s) { router.push("/setup"); return; }
    setSettings(s);
    setCurrentBalance(s.checkingBalance);
    setAmounts(localRepo.loadAmounts(monthKey));
    setMonthBalances(localRepo.loadMonthBalances());
    setLoaded(true);
    setAutoFill(true);
  }, []);

  // Save amounts whenever they change
  useEffect(() => {
    if (loaded) localRepo.saveAmounts(amounts, monthKey);
  }, [amounts, loaded]);

  const weeks = useMemo(() => getWeekRanges(year, month), [year, month]);

  // Auto fill defaults on load
  useEffect(() => {
    if (!settings || !loaded) return;
    const currentMonthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
    const saved = localRepo.loadAmounts(currentMonthKey);
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
    localRepo.saveMonthBalances(updated);
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
      localRepo.saveCCCharges([...localRepo.loadCCCharges(), ...newCharges]);
    }

    // Find the CC payment line item for this card and roll total into next month week 3
    if (total > 0) {
      const nextMonthKey =
        month === 11
          ? `${year + 1}-01`
          : `${year}-${String(month + 2).padStart(2, "0")}`;
      const nextAmounts = localRepo.loadAmounts(nextMonthKey);
      const item = settings.lineItems.find(
        (i) =>
          i.category === "Credit Cards" &&
          i.paymentMethod === "checking" &&
          i.name.toLowerCase().includes(card.label.toLowerCase())
      );
      if (item) {
        const existing = nextAmounts[item.id]?.[2] ?? 0;
        const newTotal = existing + total;
        localRepo.saveAmounts(
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
        <p className="text-harbor-navy/50">Dropping anchor...</p>
      </main>
    );
  }

  return (
    <main className="flex-1 bg-harbor-offwhite text-slate-900 p-4">
      <div className="max-w-[1400px] mx-auto space-y-4">

        {/* Page controls */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-harbor-teal-light space-y-3">

          {/* Row 1: Month nav + quick-add */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <button
                onClick={prevMonth}
                className="w-9 h-9 flex items-center justify-center rounded-lg bg-harbor-teal-light hover:bg-harbor-teal/20 text-harbor-navy font-bold transition-colors"
              >
                ←
              </button>
              <span className="font-bold text-base md:text-lg w-44 text-center text-harbor-navy">{monthName}</span>
              <button
                onClick={nextMonth}
                className="w-9 h-9 flex items-center justify-center rounded-lg bg-harbor-teal-light hover:bg-harbor-teal/20 text-harbor-navy font-bold transition-colors"
              >
                →
              </button>
            </div>

            <div className="flex items-center gap-2">
              <Link
                href="/settings#waves"
                className="flex items-center gap-1 px-3 py-2 rounded-lg border border-harbor-green/30 bg-harbor-green/5 text-harbor-green text-xs font-medium hover:bg-harbor-green/10 transition-colors"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                Add Wave
              </Link>
              <Link
                href="/settings#ripples"
                className="flex items-center gap-1 px-3 py-2 rounded-lg border border-harbor-red/30 bg-harbor-red/5 text-harbor-red text-xs font-medium hover:bg-harbor-red/10 transition-colors"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                Add Ripple
              </Link>
            </div>
          </div>

          {/* Row 2: Balance controls */}
          <div className="flex items-center gap-4 flex-wrap">
            <div>
              <label className="text-xs text-slate-400 block">Anchor</label>
              <span className={`font-semibold text-lg ${startingBalance >= 0 ? "text-harbor-green" : "text-harbor-red"}`}>
                {formatMoney(startingBalance)}
              </span>
            </div>
            <div>
              <label className="text-xs text-slate-400 block">Override Anchor</label>
              <input
                type="number"
                inputMode="decimal"
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
                      <div className="flex items-center gap-1.5 group">
                        <span>{item.name}</span>
                        {item.isIncome && <span className="text-xs text-harbor-green font-medium">↑</span>}
                        <Link
                          href="/settings"
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-300 hover:text-harbor-teal flex-shrink-0"
                          title="Edit in Settings"
                        >
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                          </svg>
                        </Link>
                      </div>
                    </td>
                    <td className="px-2 py-2 text-center">
                      <Link
                        href="/settings"
                        title="Change method in Settings"
                        className={`text-xs px-2 py-0.5 rounded-full font-medium hover:ring-2 hover:ring-offset-1 transition-all ${
                          item.paymentMethod === "checking"
                            ? "bg-harbor-teal/15 text-harbor-teal hover:ring-harbor-teal/40"
                            : "bg-harbor-navy/10 text-harbor-navy hover:ring-harbor-navy/30"
                        }`}
                      >
                        {item.paymentMethod === "checking"
                          ? "CHK"
                          : cardLookup[item.paymentMethod] ?? item.paymentMethod}
                      </Link>
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
                              className={item.isIncome
                                ? "w-24 text-right rounded-lg border-l-2 border-l-harbor-green border-t border-r border-b border-slate-200 px-2 py-1 text-sm text-harbor-green focus:outline-none focus:ring-1 focus:ring-harbor-teal/20"
                                : "w-24 text-right rounded-lg border-l-2 border-l-harbor-red border-t border-r border-b border-slate-200 px-2 py-1 text-sm text-harbor-red focus:outline-none focus:ring-1 focus:ring-harbor-red/20"}
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
                  Dock Summary
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
                            <div className="inline-flex flex-col items-center gap-1.5">
                              <span>{formatMoney(total)}</span>
                              <button
                                onClick={() => closeWeek(card, wi)}
                                className="text-xs bg-harbor-navy text-white hover:bg-harbor-teal px-2.5 py-0.5 rounded-full font-medium transition-colors leading-none whitespace-nowrap"
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
                  Net
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
                  Projected Anchor
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
                      return (
                        <div key={item.id} className="flex items-center justify-between px-4 py-2.5 gap-3">
                          <div className="flex items-center gap-1.5 min-w-0 flex-1">
                            <span className="text-sm text-slate-700 truncate">{item.name}</span>
                            {item.isIncome && <span className="text-xs text-harbor-green font-medium flex-shrink-0">↑</span>}
                          </div>
                          <input
                            type="number"
                            inputMode="decimal"
                            min="0"
                            step="0.01"
                            placeholder="0"
                            value={val === 0 ? "" : val}
                            onChange={(e) => setAmount(item.id, activeWeekIdx, e.target.value === "" ? "" : Number(e.target.value))}
                            className={`w-24 text-right rounded-lg border-l-2 px-2 py-2 text-sm flex-shrink-0 focus:outline-none focus:ring-1 ${
                              item.isIncome
                                ? "border-l-harbor-green border border-slate-200 text-harbor-green focus:ring-harbor-teal/20"
                                : "border-l-harbor-red border border-slate-200 text-harbor-red focus:ring-harbor-red/20"
                            }`}
                          />
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
                <span className="font-semibold text-harbor-navy text-xs uppercase tracking-wide">Dock Summary</span>
              </div>
              <div className="divide-y divide-slate-100">
                {settings.creditCards.map((card) => {
                  const total = creditTotals[activeWeekIdx]?.[card.id] ?? 0;
                  if (total === 0) return null;
                  const closeKey = `${year}-${month}-${card.id}-${activeWeekIdx}`;
                  return (
                    <div key={card.id} className="flex items-center justify-between px-4 py-3 gap-3">
                      <span className="text-sm font-semibold text-harbor-navy">{card.label}</span>
                      {closedWeeks.has(closeKey) ? (
                        <span className="text-xs text-harbor-green font-medium">✓ Closed</span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-harbor-navy">{formatMoney(total)}</span>
                          <button
                            onClick={() => closeWeek(card, activeWeekIdx)}
                            className="text-xs bg-harbor-navy text-white hover:bg-harbor-teal px-2.5 py-1.5 rounded-full font-medium transition-colors whitespace-nowrap"
                          >
                            Close Week
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
                <div className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-sm font-semibold text-harbor-navy uppercase tracking-wide">Net</span>
                  <span className={`text-sm font-bold ${(weekTotals[activeWeekIdx] ?? 0) >= 0 ? "text-harbor-green" : "text-harbor-red"}`}>
                    {formatMoney(weekTotals[activeWeekIdx] ?? 0)}
                  </span>
                </div>
                <div className="flex items-center justify-between px-4 py-3 bg-harbor-navy rounded-b-2xl">
                  <span className="text-sm font-bold text-white uppercase tracking-wide">Projected Anchor</span>
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
