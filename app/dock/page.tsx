"use client";

import { currentDockWeekOffset, pastOccurrenceStates } from "../lib/dock-reconciliation";
import { DesktopDockWeek, DockWeekInsights } from "../components/DockWeekDetail";
import { ActionSheet } from "../components/ActionSheet";
import { mergeDockEvents, weekProjection, occurrenceKey } from "../lib/dock-view";
import { FinancialInput } from "../components/FinancialInput";


import { DisclosureHeader } from "../components/DisclosureHeader";
import { HarborLoading } from "../components/HarborLoading";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { loadSettingsWithSupabaseFallback } from "../lib/budget-settings";
import { budgetRepo } from "../lib/repositories/budget-repo";
import { budgetActions } from "../lib/budget-actions";
import { buildProjectedAmounts } from "../lib/schedule";
import type { AppSettings, DockItemState, SpendLogEntry } from "../lib/types";
import type { Buoy } from "../lib/local-repo";
import {
  buildCashEvents,
  buildDockForecast,
  buildDockProjection,
  formatMoney,
  formatShortDate,
  getCalendarWeeksForMonth,
  getCalendarWeeksForRange,
  isoDate,
  monthKeyFor,
  monthPartsFromKey,
  weekIndexForDate,
} from "../lib/harbor-domain";
import type { HarborCashEvent, HarborWeekForecast } from "../lib/harbor-domain";

const DockSpendContext = createContext<(event: HarborCashEvent) => void>(() => {});
const DockItemsContext = createContext<AppSettings["lineItems"]>([]);

type CashEventDraft = {
  type: "payment" | "income";
  label: string;
  amount: string;
  date: string;
};

function todayISODate() {
  return isoDate(new Date());
}

function startOfDate(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function eventImpact(event: HarborCashEvent) {
  return event.kind === "income" ? event.amount : -event.amount;
}

function monthKeysForRange(start: Date, end: Date) {
  const keys: string[] = [];
  const current = new Date(start.getFullYear(), start.getMonth(), 1);
  const final = new Date(end.getFullYear(), end.getMonth(), 1);

  while (current <= final) {
    keys.push(monthKeyFor(current.getFullYear(), current.getMonth()));
    current.setMonth(current.getMonth() + 1);
  }

  return keys;
}

export default function DockPage() {
  const router = useRouter();
  const now = useMemo(() => startOfDate(new Date()), []);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [amountsByMonth, setAmountsByMonth] = useState<Record<string, Record<string, Record<number, number>>>>({});
  const [spendLogs, setSpendLogs] = useState<SpendLogEntry[]>([]);
  const [dockStates, setDockStates] = useState<DockItemState[]>([]);
  const [buoys, setBuoys] = useState<Buoy[]>([]);
  const [checkingBalance, setCheckingBalance] = useState("");
  const [checkingDraft, setCheckingDraft] = useState("");
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedWeek, setSelectedWeek] = useState<string | null>(null);
  const [historyFloor, setHistoryFloor] = useState<string | null>(null);
  const [reconcilePrompt, setReconcilePrompt] = useState(false);
  const [reviewPast, setReviewPast] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [reconcileError, setReconcileError] = useState<string | null>(null);
  const [checkingUpdatedAt, setCheckingUpdatedAt] = useState<string | undefined>();
  const [actionError, setActionError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadingTimeline, setLoadingTimeline] = useState(false);
  const [timelineLoaded, setTimelineLoaded] = useState(false);
  const [horizonWeeks, setHorizonWeeks] = useState(8);
  const [expandedWeeks, setExpandedWeeks] = useState<Record<string, boolean>>({});
  const [savingEventIds, setSavingEventIds] = useState<Record<string, boolean>>({});
  const [savingChecking, setSavingChecking] = useState(false);
  const [savingCashEvent, setSavingCashEvent] = useState(false);
  const [spendEvent, setSpendEvent] = useState<HarborCashEvent | null>(null);
  const [spendAmount, setSpendAmount] = useState("");
  const [spendDate, setSpendDate] = useState(todayISODate());
  const [savingSpend, setSavingSpend] = useState(false);
  const [spendError, setSpendError] = useState<string | null>(null);
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [showCheckingForm, setShowCheckingForm] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [eventDraft, setEventDraft] = useState<CashEventDraft>({ type: "payment", label: "", amount: "", date: todayISODate() });
  const checkingInputRef = useRef<HTMLInputElement>(null);

  const anchorDate = useMemo(() => {
    if (!checkingUpdatedAt) return now;
    const parsed = new Date(checkingUpdatedAt);
    return Number.isNaN(parsed.getTime()) ? now : startOfDate(parsed);
  }, [checkingUpdatedAt, now]);
  const currentOffset = currentDockWeekOffset(anchorDate, now);
  const visibleOffset = Math.max(0, currentOffset + weekOffset);
  const weeks = useMemo(() => getCalendarWeeksForRange(anchorDate, horizonWeeks + visibleOffset), [anchorDate, horizonWeeks, visibleOffset]);
  const lookbackDate = useMemo(() => {
    const recent = addDays(anchorDate, -21);
    const floor = historyFloor ? new Date(`${historyFloor}-01T00:00:00`) : recent;
    return floor < recent ? floor : recent;
  }, [anchorDate, historyFloor]);
  const rangeEnd = weeks.at(-1)?.end ?? addDays(anchorDate, 55);
  const monthKeys = useMemo(() => monthKeysForRange(lookbackDate, rangeEnd), [lookbackDate, rangeEnd]);
  const startingChecking = Number(checkingBalance || 0);

  const cashEvents = useMemo(() => {
    if (!settings) return [];
    const builtEvents = monthKeys.flatMap((monthKey) => {
      const { year, month } = monthPartsFromKey(monthKey);
      const sourceWeeks = getCalendarWeeksForMonth(year, month);
      const monthSpendLogs = spendLogs.filter((entry) => entry.monthKey === monthKey);
      const monthDockStates = dockStates.filter((state) => state.monthKey === monthKey);
      return buildCashEvents({
        settings,
        weeks: sourceWeeks,
        month,
        monthKey,
        amounts: amountsByMonth[monthKey] ?? {},
        spendLogs: monthSpendLogs,
        cardSpendLogs: spendLogs,
        dockStates: monthDockStates,
        cardPaymentStates: dockStates,
        buoys,
      });
    });
    return mergeDockEvents(builtEvents, dockStates);
  }, [amountsByMonth, buoys, dockStates, monthKeys, settings, spendLogs]);

  const eventSaving = savingChecking || reconciling ? Object.fromEntries(cashEvents.map((event) => [event.id, true])) : savingEventIds;

  const activeCashEvents = useMemo(() => cashEvents.filter((event) => event.date >= anchorDate && event.status !== "done"), [anchorDate, cashEvents]);
  const overdueCashEvents = useMemo(() => cashEvents.filter((event) => event.date < anchorDate && event.status !== "done"), [anchorDate, cashEvents]);
  const historyEvents = useMemo(() => [
    ...cashEvents.filter((event) => event.status === "done"),
    ...dockStates.filter((state) => state.status === "skipped" && state.pendingUntil).map((state): HarborCashEvent => ({
      id: `skipped:${state.itemId}:${state.monthKey}:${state.weekIndex}`, date: new Date(`${state.pendingUntil}T00:00:00`),
      label: state.note || settings?.lineItems.find((item) => item.id === state.itemId)?.name || "Skipped occurrence",
      amount: Number(state.plannedAmount ?? 0), kind: state.itemKind === "wave" ? "income" : state.itemKind === "credit_card_payment" ? "cardPayment" : "checkingPayment",
      status: "done", sourceMonthKey: state.monthKey, itemId: state.itemId, itemKind: state.itemKind, weekIndex: state.weekIndex, state,
    })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime()), [cashEvents, dockStates, settings]);
  const forecast = useMemo(() => buildDockForecast(activeCashEvents, startingChecking, weeks), [activeCashEvents, startingChecking, weeks]);
  const visibleForecast = forecast.slice(visibleOffset, visibleOffset + horizonWeeks);
  const selected = visibleForecast.find((week) => isoDate(week.week.start) === selectedWeek) ?? visibleForecast[0];
  const projectionEndDate = rangeEnd;
  const projectionPoints = useMemo(() => buildDockProjection(activeCashEvents, startingChecking, anchorDate, projectionEndDate), [activeCashEvents, anchorDate, projectionEndDate, startingChecking]);
  const projectedPoint = projectionPoints.at(-1) ?? { date: projectionEndDate, balance: startingChecking };
  const lowestPoint = visibleForecast.reduce((lowest, week) => week.lowest < lowest.balance ? { balance: week.lowest, date: week.lowestDate } : lowest, { balance: visibleForecast[0]?.lowest ?? startingChecking, date: visibleForecast[0]?.lowestDate ?? anchorDate });

  useEffect(() => {
    let cancelled = false;
    async function loadInitial() {
      const [savedSettings, savedAnchor, oldestMonth] = await Promise.all([
        loadSettingsWithSupabaseFallback(),
        budgetRepo.getCheckingAnchor(),
        budgetRepo.getEarliestUnresolvedDockMonth(),
      ]);
      if (cancelled) return;
      if (!savedSettings) {
        router.push("/setup");
        return;
      }
      setSettings(savedSettings);
      setCheckingBalance(String(savedAnchor.balance ?? savedSettings.checkingBalance ?? 0));
      setCheckingUpdatedAt(savedAnchor.updatedAt);
      setHistoryFloor(oldestMonth);
      setLoaded(true);
    }
    void loadInitial().catch((error) => { if (!cancelled) setActionError(error instanceof Error ? error.message : "Dock could not be loaded. Please retry."); });
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (!settings) return;
    const activeSettings = settings;
    let cancelled = false;
    async function loadTimeline() {
      setLoadingTimeline(true);
      setTimelineLoaded(false);
      try {
        const monthResults = await Promise.all(monthKeys.map(async (monthKey) => {
          const { year, month } = monthPartsFromKey(monthKey);
          const sourceWeeks = getCalendarWeeksForMonth(year, month);
          const [savedAmounts, savedSpendLogs, savedDockStates] = await Promise.all([
            budgetRepo.getMonthlyAmounts(monthKey),
            budgetRepo.getSpendLogs(monthKey),
            budgetRepo.getDockItemStates(monthKey),
          ]);
          return {
            monthKey,
            amounts: buildProjectedAmounts(activeSettings, sourceWeeks, month, savedAmounts),
            spendLogs: savedSpendLogs,
            dockStates: savedDockStates,
          };
        }));
        const savedBuoys = await budgetRepo.getBuoys();
        if (cancelled) return;
        setAmountsByMonth(Object.fromEntries(monthResults.map((result) => [result.monthKey, result.amounts])));
        setSpendLogs(monthResults.flatMap((result) => result.spendLogs));
        setDockStates(monthResults.flatMap((result) => result.dockStates));
        setBuoys(savedBuoys);
        setTimelineLoaded(true);
      } catch (error) {
        setActionError(error instanceof Error ? error.message : "The forecast could not be loaded.");
      } finally {
        if (!cancelled) setLoadingTimeline(false);
      }
    }
    void loadTimeline();
    return () => {
      cancelled = true;
    };
  }, [monthKeys, settings]);

  useEffect(() => {
    if (!showCheckingForm) return;
    window.requestAnimationFrame(() => {
      checkingInputRef.current?.focus();
      checkingInputRef.current?.select();
    });
  }, [showCheckingForm]);

  async function saveCheckingBalance() {
    const parsed = Number(checkingDraft);
    if (!checkingDraft.trim() || !Number.isFinite(parsed) || !timelineLoaded || reconciling || savingChecking) return;
    setSavingChecking(true); setActionError(null);
    try {
      const cutoff = startOfDate(new Date());
      const past = pastOccurrenceStates(cashEvents, cutoff);
      // Snapshot the backlog first. On any failure, keep the old checking anchor.
      for (const state of past) await saveDockState(state);
      if (past.length) setHistoryFloor((floor) => [floor, ...past.map((state) => state.monthKey)].filter((value): value is string => Boolean(value)).sort()[0]);
      const saved = await budgetRepo.saveCheckingAnchor(parsed);
      setCheckingBalance(String(saved.balance ?? 0)); setCheckingUpdatedAt(saved.updatedAt);
      setShowCheckingForm(false); setWeekOffset(0); setSelectedWeek(null);
      setReconcileError(null); setReconcilePrompt(past.length > 0);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "The checking balance could not be saved. The previous anchor is unchanged.");
    } finally { setSavingChecking(false); }
  }

  async function skipPastOccurrences() {
    setReconciling(true); setReconcileError(null);
    const states = pastOccurrenceStates(cashEvents, anchorDate, true);
    let failures = 0;
    for (const state of states) {
      try { await saveDockState(state); } catch { failures++; }
    }
    setReconciling(false);
    if (failures) setReconcileError(`${failures} occurrence(s) could not be skipped. Saved changes are retained; retry the remaining items.`);
    else { setReconcilePrompt(false); setReviewPast(true); }
  }

  function openPastReview() {
    setReconcilePrompt(false); setReviewPast(true);
    window.requestAnimationFrame(() => document.getElementById("past-occurrence-review")?.scrollIntoView({ block: "start", behavior: "smooth" }));
  }

  async function saveDockState(state: DockItemState) {
    const saved = await budgetRepo.saveDockItemState(state);
    setDockStates((current) => {
      const without = current.filter((item) => !(item.itemId === saved.itemId && item.itemKind === saved.itemKind && item.weekIndex === saved.weekIndex && item.monthKey === saved.monthKey));
      return [...without, saved];
    });
  }

  async function addOneTimeEvent() {
    if (savingChecking || reconciling) return;
    const amount = Number(eventDraft.amount);
    const date = new Date(`${eventDraft.date}T00:00:00`);
    if (!Number.isFinite(amount) || amount <= 0 || !eventDraft.label.trim() || Number.isNaN(date.getTime())) return;
    setSavingCashEvent(true);
    const income = eventDraft.type === "income";
    const sourceMonthKey = monthKeyFor(date.getFullYear(), date.getMonth());
    const { year, month } = monthPartsFromKey(sourceMonthKey);
    const sourceWeeks = getCalendarWeeksForMonth(year, month);
    const weekIndex = Math.max(0, weekIndexForDate(sourceWeeks, date));
    try {
      await saveDockState({
        monthKey: sourceMonthKey,
        weekIndex,
        itemId: `${income ? "one-time-income" : "one-time-cash"}:${crypto.randomUUID()}`,
        itemKind: income ? "wave" : "ripple",
        behaviorType: income ? "income" : "fixed_bill",
        status: "upcoming",
        plannedAmount: amount,
        actualAmount: amount,
        pendingUntil: eventDraft.date,
        note: eventDraft.label.trim(),
      });
      setEventDraft({ type: "payment", label: "", amount: "", date: todayISODate() });
      setShowAddEvent(false);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "The transaction could not be saved.");
    } finally {
      setSavingCashEvent(false);
    }
  }

  function openSpend(event: HarborCashEvent) {
    setSpendEvent(event); setSpendAmount(""); setSpendDate(isoDate(event.date)); setSpendError(null);
  }

  async function saveDockSpend() {
    if (savingChecking || reconciling) return;
    if (!spendEvent || !Number.isFinite(Number(spendAmount)) || Number(spendAmount) <= 0 || !spendDate) return;
    setSavingSpend(true); setSpendError(null);
    try {
      const saved = await budgetRepo.saveSpendLog({
        id: crypto.randomUUID(), monthKey: spendEvent.sourceMonthKey, weekIndex: spendEvent.weekIndex,
        rippleId: spendEvent.itemId, amount: Number(spendAmount), paymentMethod: "checking", date: spendDate,
        note: spendEvent.label, createdAt: new Date().toISOString(),
      });
      setSpendLogs((current) => [saved, ...current]); setSpendEvent(null);
    } catch (error) {
      setSpendError(error instanceof Error ? error.message : "Spending could not be saved.");
    } finally { setSavingSpend(false); }
  }

  function openWeekAdd(date: Date) {
    setActionError(null);
    setEventDraft({ type: "payment", label: "", amount: "", date: isoDate(date < anchorDate ? anchorDate : date) });
    setShowAddEvent(true);
  }

  function canEditOccurrence(event: HarborCashEvent) {
    if (cashEvents.filter((candidate) => occurrenceKey(candidate) === occurrenceKey(event)).length <= 1) return true;
    setActionError("This item has multiple dates in one weekly record. Edit its schedule in Settings; Dock cannot safely change just one of those dates yet.");
    return false;
  }

  async function setEventDone(event: HarborCashEvent, done: boolean) {
    if (savingChecking || reconciling) return false;
    if (!canEditOccurrence(event)) return false;
    const nextState = {
      ...event.state,
      monthKey: event.sourceMonthKey,
      weekIndex: event.weekIndex,
      itemId: event.itemId,
      itemKind: event.itemKind,
      behaviorType: event.kind === "income" ? "income" : event.kind === "cardPayment" ? "credit_card_payment" : "fixed_bill",
      status: done ? "cleared" : "upcoming",
      plannedAmount: event.state?.plannedAmount ?? event.amount,
      actualAmount: event.amount,
      pendingUntil: isoDate(event.date),
      clearedAt: done ? new Date().toISOString() : undefined,
      note: event.label,
    } satisfies DockItemState;
    setSavingEventIds((current) => ({ ...current, [event.id]: true }));
    setActionError(null);
    try {
      await saveDockState(nextState);
      return true;
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "The change could not be saved. Please try again.");
      return false;
    } finally {
      setSavingEventIds((current) => ({ ...current, [event.id]: false }));
    }
  }

  async function setEventSkipped(event: HarborCashEvent) {
    if (savingChecking || reconciling) return false;
    if (!canEditOccurrence(event)) return false;
    const nextState = {
      ...event.state,
      monthKey: event.sourceMonthKey,
      weekIndex: event.weekIndex,
      itemId: event.itemId,
      itemKind: event.itemKind,
      behaviorType: event.kind === "income" ? "income" : event.kind === "cardPayment" ? "credit_card_payment" : "fixed_bill",
      status: "skipped",
      plannedAmount: event.state?.plannedAmount ?? event.amount,
      actualAmount: 0,
      pendingUntil: isoDate(event.date),
      note: event.label,
    } satisfies DockItemState;
    setSavingEventIds((current) => ({ ...current, [event.id]: true }));
    setActionError(null);
    try {
      await saveDockState(nextState);
      return true;
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "The change could not be saved. Please try again.");
      return false;
    } finally {
      setSavingEventIds((current) => ({ ...current, [event.id]: false }));
    }
  }

  async function updateEventAmount(event: HarborCashEvent, amount: number, date?: string) {
    if (savingChecking || reconciling) return false;
    if (!canEditOccurrence(event)) return false;
    if (!Number.isFinite(amount) || amount <= 0 || (date && !/^\d{4}-\d{2}-\d{2}$/.test(date))) return false;
    const nextState = {
      ...event.state,
      monthKey: event.sourceMonthKey,
      weekIndex: event.weekIndex,
      itemId: event.itemId,
      itemKind: event.itemKind,
      behaviorType: event.kind === "income" ? "income" : event.kind === "cardPayment" ? "credit_card_payment" : "fixed_bill",
      status: event.state?.status === "cleared" ? "cleared" : "adjusted",
      plannedAmount: event.state?.plannedAmount ?? event.amount,
      actualAmount: amount,
      pendingUntil: date ?? isoDate(event.date),
      note: event.label,
    } satisfies DockItemState;
    setSavingEventIds((current) => ({ ...current, [event.id]: true }));
    setActionError(null);
    try {
      await saveDockState(nextState);
      return true;
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "The change could not be saved. Please try again.");
      return false;
    } finally {
      setSavingEventIds((current) => ({ ...current, [event.id]: false }));
    }
  }

  if (!loaded || !settings) {
    return (
      <main className="flex flex-1 items-center justify-center bg-harbor-offwhite text-harbor-navy">
        <div className="rounded-lg border border-harbor-teal-light bg-white px-5 py-4 text-sm shadow-sm">{actionError ? <><p role="alert">{actionError}</p><button onClick={() => window.location.reload()} className="mt-3 min-h-11 rounded-lg border px-4">Retry loading Dock</button></> : <HarborLoading label="Loading Dock" />}</div>
      </main>
    );
  }

  return (
    <DockItemsContext.Provider value={settings.lineItems}>
    <DockSpendContext.Provider value={openSpend}>
    <main className="harbor-page dock-page min-w-0 flex-1 p-3 text-harbor-navy sm:p-4 lg:p-6">
      <div className="mx-auto max-w-[1600px] space-y-4">
        {actionError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-harbor-red">{actionError}</p>}
        <header className="py-1 lg:hidden">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-2xl font-bold">Dock</h1>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
              <button type="button" onClick={() => setShowAddEvent((current) => !current)} className="harbor-action px-4 py-2 text-sm">+ Add Cash Event</button>
              <button type="button" onClick={() => { setCheckingDraft(checkingBalance); setShowCheckingForm((current) => !current); }} className="rounded-md border border-white/25 bg-white px-4 py-2 text-sm font-semibold text-harbor-teal hover:bg-white/90">Update Checking</button>
            </div>
          </div>
        </header>

        <header className="sticky top-0 z-20 hidden flex-wrap items-center justify-between gap-4 bg-harbor-offwhite/95 py-2 backdrop-blur lg:flex xl:flex-nowrap">
          <div><h1 className="text-2xl font-bold">Cash Flow</h1><p className="mt-1 text-sm text-slate-500">{horizonWeeks}-week outlook</p></div>
          <div className="flex items-center gap-2">
            <button aria-label="Previous weeks" disabled={visibleOffset === 0 || loadingTimeline} onClick={() => setWeekOffset((n) => Math.max(-currentOffset, n - 1))} className="min-h-11 rounded-lg border bg-white px-4 disabled:opacity-30">&lsaquo;</button>
            <span className="min-w-32 text-center text-sm font-semibold">{visibleForecast[0] ? formatShortDate(visibleForecast[0].week.start) + ", " + visibleForecast[0].week.start.getFullYear() : "Loading"}</span>
            <button aria-label="Next weeks" disabled={loadingTimeline} onClick={() => setWeekOffset((n) => n + 1)} className="min-h-11 rounded-lg border bg-white px-4 disabled:opacity-30">&rsaquo;</button>
            <select aria-label="Forecast horizon" value={horizonWeeks} onChange={(event) => setHorizonWeeks(Number(event.target.value))} className="ml-2 min-h-11 rounded-lg border bg-white px-3 text-sm">{[4, 8, 12].map((count) => <option key={count} value={count}>{count} weeks</option>)}</select>
          </div>
          <div className="flex items-center gap-5 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"><div><p className="text-xs font-semibold">Checking balance</p><p className="text-2xl font-bold tabular-nums">{formatMoney(startingChecking)}</p><p className="text-xs text-slate-500">{checkingUpdatedAt ? `Updated ${new Date(checkingUpdatedAt).toLocaleString()}` : "Opening balance"}</p></div><button onClick={() => { setCheckingDraft(checkingBalance); setShowCheckingForm(true); }} className="rounded-lg border border-teal-100 px-4 py-2 text-sm font-semibold text-teal-700">Edit checking</button></div>
        </header>
        <section className="grid grid-cols-2 gap-2 rounded-xl bg-white p-2 sm:grid-cols-3 sm:gap-3 lg:hidden">
          <div className="col-span-2 sm:col-span-1"><Metric label="Current Balance" value={startingChecking} detail={checkingUpdatedAt ? `Updated ${new Date(checkingUpdatedAt).toLocaleString()}` : "Opening balance"} /></div>
          {timelineLoaded ? (
            <>
              <Metric label="Projected End" value={projectedPoint.balance} detail={`Through ${formatShortDate(rangeEnd)}`} tone={projectedPoint.balance < 0 ? "red" : "navy"} />
              <Metric label="Lowest Point" value={lowestPoint.balance} detail={formatShortDate(lowestPoint.date)} tone={lowestPoint.balance < 0 ? "red" : lowestPoint.balance < 500 ? "warning" : "navy"} />
            </>
          ) : (
            <>
              <LoadingMetric label="Projected" detail="Loading forecast" />
              <LoadingMetric label="Lowest Point" detail="Loading forecast" />
            </>
          )}
        </section>

        {showCheckingForm && (
          <section className="rounded-xl border border-teal-200 bg-teal-50 p-3 shadow-sm">
            <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_180px_auto_auto] md:items-end">
              <div className="min-w-0">
                <h2 className="text-sm font-bold">Update Checking</h2>
                <p className="text-xs text-harbor-navy/50">Saving sets today as the forecast starting date.</p>
              </div>
              <label className="grid min-w-0 gap-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-harbor-navy/45">Balance</span>
                <FinancialInput ref={checkingInputRef} type="number" value={checkingDraft} disabled={savingChecking} onChange={(event) => setCheckingDraft(event.target.value)} className="w-full min-w-0 rounded-md border border-slate-200 bg-white px-3 py-2 text-right text-sm font-semibold disabled:opacity-50" />
              </label>
              <button type="button" disabled={savingChecking || reconciling || !timelineLoaded || !checkingDraft.trim()} onClick={() => void saveCheckingBalance()} className="rounded-md bg-harbor-teal px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{savingChecking ? "Saving..." : "Save"}</button>
              <button type="button" disabled={savingChecking} onClick={() => setShowCheckingForm(false)} className="rounded-md px-3 py-2 text-sm font-semibold text-harbor-navy/45 disabled:opacity-50">Cancel</button>
            </div>
          </section>
        )}

        <ActionSheet open={reconcilePrompt} title="What should happen to earlier transactions?" onClose={() => { if (!reconciling) setReconcilePrompt(false); }}>
          <p className="text-sm text-slate-600">Your checking balance is now {formatMoney(startingChecking)} as of {formatShortDate(anchorDate)}. {overdueCashEvents.length} unresolved transaction(s) are dated before that day.</p>
          <p className="text-sm text-slate-600">They are excluded from the new forecast so past activity is not counted twice. Review what happened, move outstanding payments forward, or skip them. Skipping keeps history and does not change recurring schedules.</p>
          {reconcileError && <p role="alert" className="text-sm text-red-600">{reconcileError}</p>}
          <button disabled={reconciling || !timelineLoaded} onClick={openPastReview} className="bg-teal-50 font-semibold text-teal-700">Manage one by one</button>
          <button disabled={reconciling || !timelineLoaded || !pastOccurrenceStates(cashEvents, anchorDate, true).length} onClick={() => void skipPastOccurrences()} className="bg-slate-50 font-semibold">{reconciling ? "Skipping..." : `Skip all past occurrences (${pastOccurrenceStates(cashEvents, anchorDate, true).length})`}</button>
          <button disabled={reconciling} onClick={() => setReconcilePrompt(false)}>Keep unresolved - review later</button>
        </ActionSheet>
        <ActionSheet open={Boolean(spendEvent)} title={`Log Spend: ${spendEvent?.label ?? ""}`} onClose={() => { if (!savingSpend) setSpendEvent(null); }}>
          <form onSubmit={(event) => { event.preventDefault(); void saveDockSpend(); }} className="grid gap-3">
            <p className="text-sm text-slate-500">Record the actual checking transaction for this planned allowance.</p>
            <label className="grid gap-1 text-sm">Amount<FinancialInput required aria-label="Spend amount" type="number" min="0.01" step="0.01" value={spendAmount} disabled={savingSpend} onChange={(event) => setSpendAmount(event.target.value)} className="field" /></label>
            <label className="grid gap-1 text-sm">Date<input required aria-label="Spend date" type="date" value={spendDate} disabled={savingSpend} onChange={(event) => setSpendDate(event.target.value)} className="field" /></label>
            {spendError && <p role="alert" className="text-sm text-red-600">{spendError}</p>}
            <button disabled={savingSpend} className="harbor-action px-3 py-3 disabled:opacity-40">{savingSpend ? "Saving..." : "Save spending"}</button>
          </form>
        </ActionSheet>
        <ActionSheet open={showAddEvent} title="Add cash transaction" onClose={() => setShowAddEvent(false)}>
          <section className="space-y-3">
            <div className="grid gap-3">
              <select aria-label="Transaction type" className="rounded-md border border-slate-200 px-3 py-2 text-sm" value={eventDraft.type} onChange={(event) => setEventDraft((draft) => ({ ...draft, type: event.target.value as CashEventDraft["type"] }))}>
                <option value="payment">Payment Out</option>
                <option value="income">Cash In</option>
              </select>
              <input aria-label="Transaction description" className="rounded-md border border-slate-200 px-3 py-2 text-sm" type="text" placeholder="Description" value={eventDraft.label} onChange={(event) => setEventDraft((draft) => ({ ...draft, label: event.target.value }))} />
              <FinancialInput aria-label="Transaction amount" className="rounded-md border border-slate-200 px-3 py-2 text-sm" type="number" min="0" step="0.01" placeholder="Amount" value={eventDraft.amount} onChange={(event) => setEventDraft((draft) => ({ ...draft, amount: event.target.value }))} />
              <input className="rounded-md border border-slate-200 px-3 py-2 text-sm" aria-label="Transaction date" type="date" value={eventDraft.date} onChange={(event) => setEventDraft((draft) => ({ ...draft, date: event.target.value }))} />
              {actionError && <p role="alert" className="text-sm text-red-600">{actionError}</p>}
              <button type="button" disabled={savingCashEvent || !eventDraft.label.trim() || !eventDraft.date || Number(eventDraft.amount) <= 0} onClick={() => void addOneTimeEvent()} className="rounded-md bg-harbor-teal px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{savingCashEvent ? "Adding..." : "Add Event"}</button>
            </div>
          </section>
        </ActionSheet>

        {timelineLoaded && overdueCashEvents.length > 0 && <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm"><span>{overdueCashEvents.length} earlier transactions need review; excluded from this forecast.</span><button onClick={() => { setReconcileError(null); setReconcilePrompt(true); }} className="min-h-11 rounded-lg border border-amber-200 bg-white px-3 font-semibold">Review earlier transactions</button></div>}
        {anchorDate < now && <p className="text-xs text-slate-500">Calculated from your {formatShortDate(anchorDate)} checking update. Update checking to reconcile older activity.</p>}
        <section className="space-y-3">
          {loadingTimeline && <p className="text-sm text-harbor-navy/45">Updating forecast...</p>}
          <div className="flex flex-wrap items-center justify-between gap-2 lg:hidden">
            <div className="flex items-center gap-2">
              <button aria-label="Previous weeks" disabled={visibleOffset === 0} onClick={() => setWeekOffset((n) => Math.max(-currentOffset, n - 1))} className="min-h-11 rounded-lg border bg-white px-4 disabled:opacity-30">&lsaquo;</button>
              <span className="text-sm font-semibold">{visibleForecast[0]?.week.label ?? "Weeks"}</span>
              <button aria-label="Next weeks" onClick={() => setWeekOffset((n) => n + 1)} className="min-h-11 rounded-lg border bg-white px-4">&rsaquo;</button>
            </div>
            <select aria-label="Forecast horizon" value={horizonWeeks} onChange={(event) => setHorizonWeeks(Number(event.target.value))} className="min-h-11 rounded-lg border bg-white px-3 text-sm">{[4, 8, 12].map((count) => <option key={count} value={count}>{count} weeks</option>)}</select>
          </div>
          {timelineLoaded && <>
            <div className="hidden gap-2 overflow-x-auto pb-2 lg:flex" aria-label="Forecast weeks">
              {visibleForecast.map((week) => <button key={isoDate(week.week.start)} aria-controls="dock-selected-week" aria-pressed={selected === week} onClick={() => setSelectedWeek(isoDate(week.week.start))} className={`min-w-[132px] flex-1 rounded-xl border p-3 text-left ${selected === week ? "border-harbor-teal bg-teal-50" : week.lowest < 0 ? "border-red-200 bg-red-50" : "border-slate-200 bg-white"}`}>
                <div className="text-xs font-bold">{week.week.label}</div>
                <div className="mt-2 text-xs">Ending balance</div><div className={`text-lg font-bold ${week.ending < 0 ? "text-red-600" : "text-emerald-700"}`}>{formatMoney(week.ending)}</div>
                <div className={`mt-2 text-xs ${week.lowest < 0 ? "font-bold text-harbor-red" : "text-harbor-navy/60"}`}>{week.lowest < 0 ? "Warning: " : ""}Low {formatMoney(week.lowest)}</div>
                <MiniFlow week={week} />
                <div className="text-xs text-harbor-navy/60">{week.events.filter((event) => event.kind === "income").length} in / {week.events.filter((event) => event.kind !== "income").length} out</div>
              </button>)}
            </div>
            <div className="hidden space-y-3 lg:block">{selected && <>
              <DesktopDockWeek key={isoDate(selected.week.start)} week={selected} completed={historyEvents.filter((event) => event.state?.status !== "skipped" && event.date >= selected.week.start && event.date <= selected.week.end)} items={settings.lineItems} saving={eventSaving} onDone={setEventDone} onSkip={setEventSkipped} onUpdate={updateEventAmount} onAdd={openWeekAdd} onSpend={openSpend} />
              {visibleForecast.filter((week) => week !== selected).map((week) => <button key={isoDate(week.week.start)} onClick={() => setSelectedWeek(isoDate(week.week.start))} className="flex w-full flex-wrap items-center gap-5 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left"><strong className="min-w-36">{week.week.label}</strong><span className={`rounded-full px-2 py-1 text-xs ${week.lowest < 0 ? "bg-red-50 text-red-700" : "bg-teal-50 text-teal-700"}`}>{week.lowest < 0 ? "Below zero" : "On track"}</span><span className="flex-1 text-xs">Start <b>{formatMoney(week.starting)}</b></span><span className="flex-1 text-xs">In <b className="text-emerald-700">{formatMoney(week.inflows)}</b></span><span className="flex-1 text-xs">Out <b className="text-red-600">{formatMoney(week.outflows)}</b></span><span className="flex-1 text-xs">Ends <b>{formatMoney(week.ending)}</b></span><span className={`flex-1 text-xs ${week.lowest < 0 ? "text-red-600" : ""}`}>Low <b>{formatMoney(week.lowest)}</b></span><span aria-hidden="true">&#8964;</span></button>)}
            </>}</div>
            <div className="space-y-3 lg:hidden">{visibleForecast.map((week) => <TimelineWeek key={isoDate(week.week.start)} week={week} isCurrent={now >= week.week.start && now <= week.week.end} isExpanded={Boolean(expandedWeeks[isoDate(week.week.start)])} onToggle={() => setExpandedWeeks((current) => ({ ...current, [isoDate(week.week.start)]: !current[isoDate(week.week.start)] }))} onAdd={() => openWeekAdd(week.week.start)} onSetDone={setEventDone} onSkip={setEventSkipped} onUpdateAmount={updateEventAmount} savingEventIds={eventSaving} />)}</div>
          </>}

        </section>

          {timelineLoaded && overdueCashEvents.length > 0 && (
            <details id="past-occurrence-review" open={reviewPast} onToggle={(event) => setReviewPast(event.currentTarget.open)} className="scroll-mt-36 rounded-xl border border-amber-200 bg-amber-50 p-3">
              <summary className="cursor-pointer text-sm font-semibold">Review {overdueCashEvents.length} earlier events</summary>
              <p className="mt-2 text-xs text-harbor-navy/65">These precede your checking update and are excluded from the forecast. Record what happened or move an outstanding payment forward.</p>
              <div className="mt-3 overflow-hidden rounded-lg border border-amber-100 bg-white"><EventRows events={overdueCashEvents} onSetDone={setEventDone} onSkip={setEventSkipped} onUpdateAmount={updateEventAmount} savingEventIds={eventSaving} overdue /></div>
            </details>
          )}

        <section className="flex flex-wrap items-center justify-center gap-3 border-t border-harbor-teal-light pt-5">
          {timelineLoaded && historyEvents.length > 0 && (
            <button type="button" onClick={() => setShowHistory((current) => !current)} className="rounded-md px-4 py-2 text-sm font-semibold text-harbor-teal hover:text-harbor-navy">{showHistory ? "Hide Past Activity" : "View Past Activity"}</button>
          )}
        </section>

        {timelineLoaded && showHistory && historyEvents.length > 0 && (
          <section className="border-t border-slate-200 pt-4">
            <h2 className="text-sm font-bold uppercase tracking-wide text-harbor-navy/50">Past Activity</h2>
            <div className="mt-3 overflow-x-auto">
              <EventRows events={historyEvents.slice(0, 24)} onSetDone={setEventDone} onSkip={setEventSkipped} onUpdateAmount={updateEventAmount} savingEventIds={eventSaving} quiet />
            </div>
          </section>
        )}


      </div>
    </main>
    </DockSpendContext.Provider>
    </DockItemsContext.Provider>
  );
}

function Metric({ label, value, tone = "navy", detail, action }: { label: string; value: number; tone?: "navy" | "red" | "warning"; detail?: string; action?: React.ReactNode }) {
  const toneClass = tone === "red" ? "text-harbor-red" : tone === "warning" ? "text-amber-700" : "text-harbor-navy";

  return (
    <div className="px-2 py-2 sm:px-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-harbor-navy/45">{label}</div>
        {action}
      </div>
      <div className={`mt-1 text-xl font-bold tabular-nums sm:text-2xl ${toneClass}`}>{formatMoney(value)}</div>
      {detail && <div className="text-xs text-harbor-navy/50">{detail}</div>}
    </div>
  );
}

function LoadingMetric({ label, detail }: { label: string; detail: string }) {
  return (
    <div className="rounded-lg border border-teal-100 bg-white px-4 py-3 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-wide text-harbor-navy/35">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums text-harbor-navy/30">--</div>
      <div className="text-xs text-harbor-navy/45">{detail}</div>
    </div>
  );
}

function TimelineWeek({ staticHeader = false, onAdd, week, isCurrent, isExpanded, onToggle, onSetDone, onSkip, onUpdateAmount, savingEventIds }: {
  onAdd: () => void;
  staticHeader?: boolean;
  week: HarborWeekForecast;
  isCurrent: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  onSetDone: (event: HarborCashEvent, done: boolean) => void | Promise<boolean>;
  onSkip: (event: HarborCashEvent) => void | Promise<boolean>;
  onUpdateAmount: (event: HarborCashEvent, amount: number, date?: string) => Promise<boolean>;
  savingEventIds: Record<string, boolean>;
}) {
  const net = week.inflows - week.outflows;
  const risk = week.lowest < 0 ? "text-harbor-red" : week.lowest < 500 ? "text-amber-700" : "text-harbor-navy";
  const endingRisk = week.ending < 0 ? "text-harbor-red" : "text-harbor-navy";

  return (
    <section className={`${isCurrent ? "rounded-xl border border-harbor-teal bg-white shadow-sm" : "rounded-xl border border-white bg-white/75 shadow-sm"} overflow-hidden`}>
      <DisclosureHeader expanded={isExpanded} onToggle={onToggle} label={week.week.label} className={`px-3 py-3 sm:px-4 ${staticHeader ? "[&_button]:hidden" : ""}`}>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-bold">{week.week.label}</h2>
          {isCurrent && <span className="rounded-full bg-harbor-teal/10 px-2 py-0.5 text-xs font-semibold text-harbor-teal">This week</span>}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-3 tabular-nums">
          <div className={risk}><span className="text-xs font-semibold">Low</span><div className="text-lg font-bold">{formatMoney(week.lowest)}</div></div>
          <div className={endingRisk}><span className="text-xs font-semibold">Ends</span><div className="text-lg font-bold">{formatMoney(week.ending)}</div></div>
        </div>
      </DisclosureHeader>
      {isExpanded && (
        <div className="border-t border-slate-100 px-3 py-3 sm:px-4">
          <div className="mb-3 grid grid-cols-2 gap-2 [&>span]:rounded-lg [&>span]:bg-slate-50 [&>span]:p-3 [&_strong]:mt-1 [&_strong]:block sm:grid-cols-4 text-xs tabular-nums text-harbor-navy/65">
            <span>Start <strong>{formatMoney(week.starting)}</strong></span>
            <span className="text-harbor-green">In <strong>+{formatMoney(week.inflows)}</strong></span>
            <span className="text-harbor-red">Out <strong>&minus;{formatMoney(week.outflows)}</strong></span>
            <span>Net <strong>{net < 0 ? "-" : "+"}{formatMoney(Math.abs(net))}</strong></span>

          </div>
          <p className="mb-3 text-xs text-harbor-navy/55">Lowest point {formatShortDate(week.lowestDate)}</p>
          {week.events.length === 0 ? (
            <p className="text-sm text-harbor-navy/45">No unresolved cash events in this week.</p>
          ) : (
            <DayEventGroups week={week} onSetDone={onSetDone} onSkip={onSkip} onUpdateAmount={onUpdateAmount} savingEventIds={savingEventIds} />
          )}
          <button onClick={onAdd} className="mt-3 min-h-11 rounded-lg border border-teal-100 px-3 text-sm font-semibold text-teal-700">+ Add transaction to this week</button>
          <DockWeekInsights week={week} />
        </div>
      )}
    </section>
  );
}

function DayEventGroups({ week, onSetDone, onSkip, onUpdateAmount, savingEventIds }: { week: HarborWeekForecast; onSetDone: (event: HarborCashEvent, done: boolean) => void | Promise<boolean>; onSkip: (event: HarborCashEvent) => void | Promise<boolean>; onUpdateAmount: (event: HarborCashEvent, amount: number, date?: string) => Promise<boolean>; savingEventIds: Record<string, boolean> }) {
  const balances = Object.fromEntries(weekProjection(week).filter((point) => point.event).map((point) => [point.event!.id, point.balance]));
  const days = week.days.length > 0
    ? week.days
    : [{ date: week.week.start, events: week.events, ending: week.ending }];

  return (
    <div className="space-y-3">
      {days.map((day) => (
        <section key={isoDate(day.date)} className="overflow-hidden rounded-xl border border-cyan-100 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-cyan-100 bg-cyan-50 px-4 py-2.5">
            <div>
              <div className="text-xs font-bold uppercase tracking-wide text-harbor-navy/65">{day.date.toLocaleDateString("en-US", { weekday: "short" })} | {formatShortDate(day.date)}</div>
            </div>
            <div className="text-right">
              <div className="text-xs font-semibold text-harbor-navy/45">Ending</div>
              <div className={`text-sm font-bold tabular-nums ${day.ending < 0 ? "text-harbor-red" : "text-harbor-navy"}`}>{formatMoney(day.ending)}</div>
            </div>
          </div>
          <EventRows balances={balances} events={day.events} onSetDone={onSetDone} onSkip={onSkip} onUpdateAmount={onUpdateAmount} savingEventIds={savingEventIds} />
        </section>
      ))}
    </div>
  );
}

function EventRows({ events, onSetDone, onSkip, onUpdateAmount, savingEventIds, balances, quiet = false, overdue = false }: { events: HarborCashEvent[]; onSetDone: (event: HarborCashEvent, done: boolean) => void | Promise<boolean>; onSkip: (event: HarborCashEvent) => void | Promise<boolean>; onUpdateAmount: (event: HarborCashEvent, amount: number, date?: string) => Promise<boolean>; savingEventIds: Record<string, boolean>; balances?: Record<string, number>; quiet?: boolean; overdue?: boolean }) {
  const items = useContext(DockItemsContext);
  const openSpend = useContext(DockSpendContext);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [amountDraft, setAmountDraft] = useState("");
  const [dateDraft, setDateDraft] = useState("");
  const [menuEvent, setMenuEvent] = useState<HarborCashEvent | null>(null);
  return (
    <div className="divide-y divide-slate-100 px-4">
      {events.map((event) => {
        const impact = eventImpact(event);
        const item = items.find((candidate) => candidate.id === event.itemId);
        const recordedLabel = event.kind === "income" ? "Received" : event.kind === "transfer" ? "Transferred" : event.kind === "cardPayment" ? "Paid" : item ? budgetActions(item, event.state, 0).recordedLabel : event.state?.behaviorType === "flexible_spend" ? "Spent" : "Paid";
        const saving = Boolean(savingEventIds[event.id]);
        const isEditing = editingEventId === event.id;
        return (
          <div key={event.id} className={`grid gap-2 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center ${quiet || event.status === "done" ? "text-harbor-navy/50" : ""}`}>
            <div className="min-w-0 sm:pr-4">
              <div className="truncate text-base font-semibold sm:text-sm">{event.label}</div>
              <div className="mt-0.5 text-xs text-harbor-navy/55">{eventContext(event)}</div>
              <div className="mt-0.5 text-xs font-medium text-harbor-navy/45 sm:hidden">{formatShortDate(event.date)} | {eventStatusLabel(event, overdue, recordedLabel)}</div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 sm:justify-end">
              <div className="text-right">
                <div className={`font-bold tabular-nums ${impact >= 0 ? "text-harbor-green" : "text-harbor-red"}`}>{formatMoney(impact)}</div>
                <div className="hidden text-xs font-medium text-harbor-navy/45 sm:block">{eventStatusLabel(event, overdue, recordedLabel)}</div>
                {balances?.[event.id] !== undefined && <div className="text-xs text-harbor-navy/55">Projected {formatMoney(balances[event.id])}</div>}
              </div>
              <div className="flex flex-wrap gap-2">
                {event.status !== "done" && <button type="button" disabled={saving} onClick={() => setMenuEvent(event)} aria-label={`More actions for ${event.label}`} className="min-h-11 rounded-lg border px-3">&bull;&bull;&bull;</button>}
                {(event.status !== "done" || event.state?.status === "cleared" || event.state?.status === "skipped") && <button type="button" disabled={saving} onClick={() => { if (recordedLabel === "Spent" && event.status !== "done") openSpend(event); else void onSetDone(event, event.status !== "done"); }} className="min-h-11 rounded-md border border-harbor-teal-light px-3 text-xs font-semibold text-harbor-teal disabled:opacity-50">{saving ? "Saving" : event.status === "done" ? event.state?.status === "skipped" ? "Restore" : "Undo" : recordedLabel === "Spent" ? "Log Spend" : `Mark ${recordedLabel}`}</button>}

              </div>
            </div>
            {isEditing && (
              <div className="rounded-md border border-teal-200 bg-teal-50 p-2 sm:col-span-2">
                <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
                  <input aria-label="Occurrence date" type="date" value={dateDraft} onChange={(event) => setDateDraft(event.target.value)} className="min-w-0 rounded-md border bg-white p-2" />
                  <FinancialInput aria-label="Occurrence amount" type="number" min="0" step="0.01" inputMode="decimal" value={amountDraft} onFocus={(event) => event.currentTarget.select()} onChange={(event) => setAmountDraft(event.target.value)} className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm" />
                  <button type="button" disabled={saving || !dateDraft || !Number.isFinite(Number(amountDraft)) || Number(amountDraft) <= 0} onClick={() => {
                    void onUpdateAmount(event, Number(amountDraft), dateDraft).then((saved) => { if (saved) setEditingEventId(null); });
                  }} className="rounded-md bg-harbor-teal px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Save occurrence</button>
                  <button type="button" disabled={saving} onClick={() => setEditingEventId(null)} className="rounded-md px-3 py-2 text-xs font-semibold text-harbor-navy/45">Cancel</button>
                </div>
              </div>
            )}
          </div>
        );
      })}      <ActionSheet open={Boolean(menuEvent)} title={menuEvent?.label ?? "Event actions"} onClose={() => setMenuEvent(null)}>
        <button onClick={() => { if (menuEvent) { setEditingEventId(menuEvent.id); setAmountDraft(menuEvent.amount.toFixed(2)); setDateDraft(isoDate(menuEvent.date)); } setMenuEvent(null); }} className="rounded-lg border p-3 text-left">Edit amount or move date</button>
        <button onClick={() => { if (menuEvent) void onSkip(menuEvent); setMenuEvent(null); }} className="rounded-lg border p-3 text-left">Skip this occurrence</button>
      </ActionSheet>

    </div>
  );
}

function eventContext(event: HarborCashEvent) {
  return [event.chart, event.sourceLabel].filter(Boolean).join(" | ") || (event.kind === "income" ? "Checking" : "Checking");
}

function eventStatusLabel(event: HarborCashEvent, overdue = false, recordedLabel = "Paid") {
  if (event.state?.status === "skipped") return "Skipped";
  if (event.status === "done") return recordedLabel;
  if (overdue) return `Past due | Scheduled ${formatShortDate(event.date)}`;
  if (event.kind === "cardPayment" || event.kind === "checkingPayment") return event.state?.pendingUntil ? "Scheduled" : "Expected";
  return "Expected";
}

function MiniFlow({ week }: { week: HarborWeekForecast }) {
  const max = Math.max(1, ...week.days.map((day) => day.events.reduce((sum, event) => sum + event.amount, 0)));
  const days = Array.from({ length: 7 }, (_, index) => { const date = addDays(week.week.start, index); return week.days.find((day) => isoDate(day.date) === isoDate(date)) ?? { date, events: [] }; });
  return <div className="my-2 flex h-6 items-end gap-1" aria-hidden="true">{days.map((day) => {
    const incoming = day.events.filter((event) => event.kind === "income").reduce((sum, event) => sum + event.amount, 0);
    const outgoing = day.events.filter((event) => event.kind !== "income").reduce((sum, event) => sum + event.amount, 0);
    return <div key={isoDate(day.date)} className="flex h-full flex-1 items-end gap-px"><span className="flex-1 bg-harbor-green" style={{ height: `${incoming / max * 100}%` }} /><span className="flex-1 bg-harbor-red/60" style={{ height: `${outgoing / max * 100}%` }} /></div>;
  })}</div>;
}
