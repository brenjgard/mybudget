"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { loadSettingsWithSupabaseFallback } from "../lib/budget-settings";
import { budgetRepo } from "../lib/repositories/budget-repo";
import { buildProjectedAmounts } from "../lib/schedule";
import type { AppSettings, DockItemState, SpendLogEntry } from "../lib/types";
import type { Buoy } from "../lib/local-repo";
import {
  buildCardObligations,
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

function dedupeEvents(events: HarborCashEvent[]) {
  const byKey = new Map<string, HarborCashEvent>();

  events.forEach((event) => {
    if (event.itemId.startsWith("projected-card-payment:")) {
      const existing = byKey.get(event.itemId);
      byKey.set(event.itemId, existing ? {
        ...existing,
        amount: existing.amount + event.amount,
        status: existing.status === "done" || event.status === "done" ? "done" : "upcoming",
        state: existing.state ?? event.state,
      } : event);
      return;
    }

    const eventMonthKey = monthKeyFor(event.date.getFullYear(), event.date.getMonth());
    const key = [
      isoDate(event.date),
      event.itemId,
      event.itemKind,
      event.kind,
      event.amount,
      event.label,
    ].join("|");
    const existing = byKey.get(key);
    if (!existing || event.sourceMonthKey === eventMonthKey) byKey.set(key, event);
  });

  return [...byKey.values()].sort((a, b) => (
    a.date.getTime() - b.date.getTime()
    || (a.kind === "income" ? 0 : 1) - (b.kind === "income" ? 0 : 1)
    || a.label.localeCompare(b.label)
  ));
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
  const [checkingUpdatedAt, setCheckingUpdatedAt] = useState<string | undefined>();
  const [loaded, setLoaded] = useState(false);
  const [loadingTimeline, setLoadingTimeline] = useState(false);
  const [horizonWeeks, setHorizonWeeks] = useState(8);
  const [expandedWeeks, setExpandedWeeks] = useState<Record<string, boolean>>({});
  const [collapsedWeeks, setCollapsedWeeks] = useState<Record<string, boolean>>({});
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [showCheckingForm, setShowCheckingForm] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [eventDraft, setEventDraft] = useState<CashEventDraft>({ type: "payment", label: "", amount: "", date: todayISODate() });

  const anchorDate = useMemo(() => {
    if (!checkingUpdatedAt) return now;
    const parsed = new Date(checkingUpdatedAt);
    return Number.isNaN(parsed.getTime()) ? now : startOfDate(parsed);
  }, [checkingUpdatedAt, now]);
  const anchorDateLabel = formatShortDate(anchorDate);
  const weeks = useMemo(() => getCalendarWeeksForRange(anchorDate, horizonWeeks), [anchorDate, horizonWeeks]);
  const rangeStart = weeks[0]?.start ?? anchorDate;
  const rangeEnd = weeks.at(-1)?.end ?? addDays(anchorDate, 55);
  const monthKeys = useMemo(() => monthKeysForRange(rangeStart, rangeEnd), [rangeEnd, rangeStart]);
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
    return dedupeEvents(builtEvents);
  }, [amountsByMonth, buoys, dockStates, monthKeys, settings, spendLogs]);

  const activeCashEvents = useMemo(() => cashEvents.filter((event) => event.date >= anchorDate && event.status !== "done"), [anchorDate, cashEvents]);
  const historyEvents = useMemo(() => cashEvents.filter((event) => event.date < anchorDate || event.status === "done"), [anchorDate, cashEvents]);
  const forecast = useMemo(() => buildDockForecast(activeCashEvents, startingChecking, weeks), [activeCashEvents, startingChecking, weeks]);
  const projectionEndDate = addDays(anchorDate, 30);
  const projectionPoints = useMemo(() => buildDockProjection(activeCashEvents, startingChecking, anchorDate, projectionEndDate), [activeCashEvents, anchorDate, projectionEndDate, startingChecking]);
  const projectedPoint = projectionPoints.at(-1) ?? { date: projectionEndDate, balance: startingChecking };
  const lowestPoint = projectionPoints.reduce((lowest, point) => point.balance < lowest.balance ? point : lowest, projectionPoints[0] ?? projectedPoint);
  const cardObligations = useMemo(() => settings ? buildCardObligations(settings, monthKeyFor(anchorDate.getFullYear(), anchorDate.getMonth()), spendLogs, cashEvents) : [], [anchorDate, cashEvents, settings, spendLogs]);

  useEffect(() => {
    let cancelled = false;
    async function loadInitial() {
      const [savedSettings, savedAnchor] = await Promise.all([
        loadSettingsWithSupabaseFallback(),
        budgetRepo.getCheckingAnchor(),
      ]);
      if (cancelled) return;
      if (!savedSettings) {
        router.push("/setup");
        return;
      }
      setSettings(savedSettings);
      setCheckingBalance(String(savedAnchor.balance ?? savedSettings.checkingBalance ?? 0));
      setCheckingUpdatedAt(savedAnchor.updatedAt);
      setLoaded(true);
    }
    void loadInitial();
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
      setLoadingTimeline(false);
    }
    void loadTimeline();
    return () => {
      cancelled = true;
    };
  }, [monthKeys, settings]);

  async function saveCheckingBalance() {
    const parsed = checkingBalance.trim() === "" ? null : Number(checkingBalance);
    if (parsed !== null && !Number.isFinite(parsed)) return;
    const saved = await budgetRepo.saveCheckingAnchor(parsed);
    setCheckingBalance(String(saved.balance ?? 0));
    setCheckingUpdatedAt(saved.updatedAt);
    setShowCheckingForm(false);
  }

  async function saveDockState(state: DockItemState) {
    const saved = await budgetRepo.saveDockItemState(state);
    setDockStates((current) => {
      const without = current.filter((item) => !(item.itemId === saved.itemId && item.itemKind === saved.itemKind && item.weekIndex === saved.weekIndex && item.monthKey === saved.monthKey));
      return [...without, saved];
    });
  }

  async function addOneTimeEvent() {
    const amount = Number(eventDraft.amount);
    const date = new Date(`${eventDraft.date}T00:00:00`);
    if (!Number.isFinite(amount) || amount <= 0 || !eventDraft.label.trim() || Number.isNaN(date.getTime())) return;
    const income = eventDraft.type === "income";
    const sourceMonthKey = monthKeyFor(date.getFullYear(), date.getMonth());
    const { year, month } = monthPartsFromKey(sourceMonthKey);
    const sourceWeeks = getCalendarWeeksForMonth(year, month);
    const weekIndex = Math.max(0, weekIndexForDate(sourceWeeks, date));
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
  }

  async function setEventDone(event: HarborCashEvent, done: boolean) {
    await saveDockState({
      ...event.state,
      monthKey: event.sourceMonthKey,
      weekIndex: event.weekIndex,
      itemId: event.itemId,
      itemKind: event.itemKind,
      behaviorType: event.kind === "income" ? "income" : event.kind === "cardPayment" ? "credit_card_payment" : "fixed_bill",
      status: done ? "cleared" : "upcoming",
      plannedAmount: event.amount,
      actualAmount: event.amount,
      pendingUntil: isoDate(event.date),
      clearedAt: done ? new Date().toISOString() : undefined,
      note: event.label,
    });
  }

  if (!loaded || !settings) {
    return (
      <main className="flex flex-1 items-center justify-center bg-harbor-offwhite text-harbor-navy">
        <div className="rounded-lg border border-harbor-teal-light bg-white px-5 py-4 text-sm shadow-sm">Loading Dock...</div>
      </main>
    );
  }

  return (
    <main className="harbor-page flex-1 p-3 text-harbor-navy sm:p-4">
      <div className="mx-auto max-w-[1180px] space-y-4 sm:space-y-6">
        <header className="harbor-hero rounded-xl px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-white/70">Dock</p>
              <h1 className="mt-1 text-2xl font-bold sm:text-3xl">Cash forecast</h1>
              <p className="mt-1 text-sm text-white/70">What hits checking, when it hits, and where cash lands.</p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
              <button type="button" onClick={() => setShowAddEvent((current) => !current)} className="harbor-action px-4 py-2 text-sm">+ Add Cash Event</button>
              <button type="button" onClick={() => setShowCheckingForm((current) => !current)} className="rounded-md border border-white/25 bg-white px-4 py-2 text-sm font-semibold text-harbor-teal hover:bg-white/90">Update Checking</button>
            </div>
          </div>
        </header>

        <section className="grid gap-2 sm:gap-3 md:grid-cols-3">
          <Metric label="Checking Now" value={startingChecking} detail={`As of ${anchorDateLabel}`} action={<button type="button" onClick={() => setShowCheckingForm(true)} className="text-xs font-semibold text-harbor-teal hover:text-harbor-navy">Update Checking</button>} />
          <Metric label={`Projected ${formatShortDate(projectedPoint.date)}`} value={projectedPoint.balance} detail="Next 30 days" tone={projectedPoint.balance < 0 ? "red" : "navy"} />
          <Metric label="Lowest Next 30 Days" value={lowestPoint.balance} detail={formatShortDate(lowestPoint.date)} tone={lowestPoint.balance < 0 ? "red" : lowestPoint.balance < 500 ? "red" : "navy"} />
        </section>

        {showCheckingForm && (
          <section className="rounded-xl border border-teal-200 bg-teal-50 p-3 shadow-sm">
            <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_180px_auto_auto] md:items-end">
              <div className="min-w-0">
                <h2 className="text-sm font-bold">Update Checking</h2>
                <p className="text-xs text-harbor-navy/50">This becomes the reality anchor for the forecast as of {anchorDateLabel}.</p>
              </div>
              <label className="grid min-w-0 gap-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-harbor-navy/45">Balance</span>
                <input type="number" value={checkingBalance} onChange={(event) => setCheckingBalance(event.target.value)} className="w-full min-w-0 rounded-md border border-slate-200 bg-white px-3 py-2 text-right text-sm font-semibold" />
              </label>
              <button type="button" onClick={() => void saveCheckingBalance()} className="rounded-md bg-harbor-teal px-4 py-2 text-sm font-semibold text-white">Save</button>
              <button type="button" onClick={() => setShowCheckingForm(false)} className="rounded-md px-3 py-2 text-sm font-semibold text-harbor-navy/45">Cancel</button>
            </div>
          </section>
        )}

        {showAddEvent && (
          <section className="rounded-xl border border-indigo-200 bg-indigo-50 p-3 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-sm font-bold">Add Cash Event</h2>
              <button type="button" onClick={() => setShowAddEvent(false)} className="text-xs font-semibold text-harbor-navy/45">Close</button>
            </div>
            <div className="grid gap-2 md:grid-cols-[140px_1fr_140px_150px_auto]">
              <select className="rounded-md border border-slate-200 px-3 py-2 text-sm" value={eventDraft.type} onChange={(event) => setEventDraft((draft) => ({ ...draft, type: event.target.value as CashEventDraft["type"] }))}>
                <option value="payment">Payment Out</option>
                <option value="income">Cash In</option>
              </select>
              <input className="rounded-md border border-slate-200 px-3 py-2 text-sm" type="text" placeholder="Description" value={eventDraft.label} onChange={(event) => setEventDraft((draft) => ({ ...draft, label: event.target.value }))} />
              <input className="rounded-md border border-slate-200 px-3 py-2 text-sm" type="number" min="0" step="0.01" placeholder="Amount" value={eventDraft.amount} onChange={(event) => setEventDraft((draft) => ({ ...draft, amount: event.target.value }))} />
              <input className="rounded-md border border-slate-200 px-3 py-2 text-sm" type="date" value={eventDraft.date} onChange={(event) => setEventDraft((draft) => ({ ...draft, date: event.target.value }))} />
              <button type="button" onClick={() => void addOneTimeEvent()} className="rounded-md bg-harbor-teal px-4 py-2 text-sm font-semibold text-white">Add Event</button>
            </div>
          </section>
        )}

        <section className="space-y-3">
          {loadingTimeline && <p className="text-sm text-harbor-navy/45">Updating forecast...</p>}
          {forecast.map((week, index) => {
            const isCurrent = anchorDate >= week.week.start && anchorDate <= week.week.end;
            const isAutoExpanded = isCurrent || (index < 3 && week.events.length > 0);
            const shouldExpand = collapsedWeeks[week.week.label]
              ? false
              : Boolean(expandedWeeks[week.week.label]) || isAutoExpanded;
            return (
              <TimelineWeek
                key={week.week.label}
                week={week}
                isCurrent={isCurrent}
                isExpanded={shouldExpand}
                onToggle={() => {
                  if (shouldExpand) {
                    setCollapsedWeeks((current) => ({ ...current, [week.week.label]: true }));
                    setExpandedWeeks((current) => ({ ...current, [week.week.label]: false }));
                    return;
                  }
                  setCollapsedWeeks((current) => ({ ...current, [week.week.label]: false }));
                  setExpandedWeeks((current) => ({ ...current, [week.week.label]: true }));
                }}
                onSetDone={setEventDone}
              />
            );
          })}
        </section>

        <section className="flex flex-wrap items-center justify-center gap-3 border-t border-harbor-teal-light pt-5">
          <button type="button" onClick={() => setHorizonWeeks((current) => current + 4)} className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-harbor-navy/65 hover:border-harbor-teal-light hover:text-harbor-teal">Show More</button>
          {historyEvents.length > 0 && (
            <button type="button" onClick={() => setShowHistory((current) => !current)} className="rounded-md px-4 py-2 text-sm font-semibold text-harbor-teal hover:text-harbor-navy">{showHistory ? "Hide Past Activity" : "View Past Activity"}</button>
          )}
        </section>

        {showHistory && historyEvents.length > 0 && (
          <section className="border-t border-slate-200 pt-4">
            <h2 className="text-sm font-bold uppercase tracking-wide text-harbor-navy/50">Past Activity</h2>
            <div className="mt-3 overflow-x-auto">
              <EventRows events={historyEvents.slice(0, 24)} onSetDone={setEventDone} quiet />
            </div>
          </section>
        )}

        {cardObligations.length > 0 && (
          <section className="border-t border-slate-200 pt-4">
            <h2 className="text-sm font-bold uppercase tracking-wide text-harbor-navy/50">Card Obligations</h2>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {cardObligations.map((obligation) => (
                <div key={obligation.card.id} className="rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-white px-4 py-3 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-bold">{obligation.card.label}</div>
                      <div className="text-xs text-harbor-navy/50">{formatShortDate(obligation.cycleStart)}-{formatShortDate(obligation.cycleEnd)} | Due {formatShortDate(obligation.dueDate)}</div>
                    </div>
                    <div className="text-right text-sm font-bold">{formatMoney(obligation.amount)}</div>
                  </div>
                  <div className="mt-2 text-xs text-harbor-navy/55">
                    {formatMoney(obligation.anchorAmount)} from balance anchor
                    {obligation.newSpending > 0 ? ` | ${formatMoney(obligation.newSpending)} new spending` : ""}
                  </div>
                  <div className="mt-1 text-xs text-harbor-navy/55">{formatMoney(obligation.scheduled)} scheduled by due date | {formatMoney(obligation.remaining)} remaining</div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

function Metric({ label, value, tone = "navy", detail, action }: { label: string; value: number; tone?: "navy" | "red"; detail?: string; action?: React.ReactNode }) {
  const toneClass = tone === "red" ? "text-harbor-red" : "text-harbor-navy";
  const accentClass = tone === "red" ? "from-red-50 to-white border-red-100" : "from-teal-50 to-white border-teal-100";
  return (
    <div className={`rounded-lg border bg-gradient-to-br px-4 py-3 shadow-sm ${accentClass}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-harbor-navy/45">{label}</div>
        {action}
      </div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${toneClass}`}>{formatMoney(value)}</div>
      {detail && <div className="text-xs text-harbor-navy/50">{detail}</div>}
    </div>
  );
}

function TimelineWeek({ week, isCurrent, isExpanded, onToggle, onSetDone }: {
  week: HarborWeekForecast;
  isCurrent: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  onSetDone: (event: HarborCashEvent, done: boolean) => void | Promise<void>;
}) {
  const net = week.inflows - week.outflows;
  const risk = week.lowest < 0 ? "text-harbor-red" : week.lowest < 500 ? "text-harbor-red" : "text-harbor-navy";

  return (
    <section className={`${isCurrent ? "rounded-xl border border-harbor-teal bg-white p-4 shadow-sm" : "rounded-xl border border-white bg-white/75 p-4 shadow-sm"} py-4`}>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className={`${isCurrent ? "text-2xl" : "text-lg"} font-bold`}>{isCurrent ? "This Week" : week.week.label}</h2>
            {isCurrent && <span className="rounded-full bg-harbor-teal/10 px-2 py-0.5 text-xs font-semibold text-harbor-teal">{week.week.label}</span>}
          </div>
          <p className="mt-2 text-sm text-harbor-navy/60">
            Starting {formatMoney(week.starting)} | In {formatMoney(week.inflows)} | Out {formatMoney(-week.outflows)} | Ending <span className={week.ending < 0 ? "font-bold text-harbor-red" : "font-bold text-harbor-navy"}>{formatMoney(week.ending)}</span>
          </p>
          <p className={`mt-1 text-sm font-semibold ${risk}`}>Lowest {formatMoney(week.lowest)} | {formatShortDate(week.lowestDate)}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className={`text-sm font-bold ${net < 0 ? "text-harbor-red" : "text-harbor-navy"}`}>{formatMoney(net)}</div>
          <button type="button" onClick={onToggle} className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-harbor-navy/65 hover:border-harbor-teal-light hover:text-harbor-teal">
            {isExpanded ? "Collapse" : "Expand"}
          </button>
        </div>
      </div>
      {isExpanded && (
        <div className="mt-3">
          {week.events.length === 0 ? (
            <p className="text-sm text-harbor-navy/45">No unresolved cash events in this week.</p>
          ) : (
            <DayEventGroups week={week} onSetDone={onSetDone} />
          )}
        </div>
      )}
    </section>
  );
}

function DayEventGroups({ week, onSetDone }: { week: HarborWeekForecast; onSetDone: (event: HarborCashEvent, done: boolean) => void | Promise<void> }) {
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
          <EventRows events={day.events} onSetDone={onSetDone} />
        </section>
      ))}
    </div>
  );
}

function EventRows({ events, onSetDone, quiet = false }: { events: HarborCashEvent[]; onSetDone: (event: HarborCashEvent, done: boolean) => void | Promise<void>; quiet?: boolean }) {
  return (
    <div className="divide-y divide-slate-100 px-4">
      {events.map((event) => {
        const impact = eventImpact(event);
        return (
          <div key={event.id} className={`grid gap-2 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center ${quiet || event.status === "done" ? "text-harbor-navy/50" : ""}`}>
            <div className="min-w-0 sm:pr-4">
              <div className="truncate text-base font-semibold sm:text-sm">{event.label}</div>
              <div className="mt-0.5 text-xs text-harbor-navy/55">{eventContext(event)}</div>
              <div className="mt-0.5 text-xs font-medium text-harbor-navy/45 sm:hidden">{formatShortDate(event.date)} | {eventStatusLabel(event)}</div>
            </div>
            <div className="flex items-center justify-between gap-3 sm:justify-end">
              <div className="text-right">
                <div className={`font-bold tabular-nums ${impact >= 0 ? "text-harbor-green" : "text-harbor-red"}`}>{formatMoney(impact)}</div>
                <div className="hidden text-xs font-medium text-harbor-navy/45 sm:block">{eventStatusLabel(event)}</div>
              </div>
              <button type="button" onClick={() => void onSetDone(event, event.status !== "done")} className="min-h-10 shrink-0 rounded-md border border-harbor-teal-light bg-white px-3 py-1.5 text-xs font-semibold text-harbor-teal hover:bg-harbor-teal-light/45">{event.status === "done" ? "Undo" : "Done"}</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function eventContext(event: HarborCashEvent) {
  return [event.chart, event.sourceLabel].filter(Boolean).join(" | ") || (event.kind === "income" ? "Checking" : "Checking");
}

function eventStatusLabel(event: HarborCashEvent) {
  if (event.status === "done") return "Paid";
  if (event.kind === "cardPayment" || event.kind === "checkingPayment") return event.state?.pendingUntil ? "Scheduled" : "Expected";
  return "Expected";
}
