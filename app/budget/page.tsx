"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { loadSettingsWithSupabaseFallback } from "../lib/budget-settings";
import { budgetRepo } from "../lib/repositories/budget-repo";
import { getRipplePlanType } from "../lib/ripple-type";
import { buildProjectedAmounts } from "../lib/schedule";
import type { AppSettings, DockItemState, LineItem, PaymentMethod, SpendLogEntry } from "../lib/types";
import {
  addMonths,
  buildCurrentForwardBudgetSummary,
  budgetedForItemWeek,
  formatMoney,
  formatShortDate,
  getCalendarWeeksForMonth,
  isCardMethod,
  isoDate,
  monthKeyFor,
  paymentMethodLabel,
  weekIndexForDate,
} from "../lib/harbor-domain";

type SpendTarget = { itemId: string; weekIndex?: number } | "global";
type WeekStatus = "left" | "saved" | "over";

type SpendDraft = {
  itemId: string;
  amount: string;
  paymentMethod: PaymentMethod;
  date: string;
  note: string;
};

type BudgetRow = {
  item: LineItem;
  budgeted: number;
  spent: number;
  remaining: number;
};

type WeekPerformance = {
  budgeted: number;
  spent: number;
  remaining: number;
};

function todayISODate() {
  return isoDate(new Date());
}

export default function BudgetPage() {
  const router = useRouter();
  const now = useMemo(() => new Date(), []);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [amounts, setAmounts] = useState<Record<string, Record<number, number>>>({});
  const [spendLogs, setSpendLogs] = useState<SpendLogEntry[]>([]);
  const [dockStates, setDockStates] = useState<DockItemState[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [monthLoading, setMonthLoading] = useState(false);
  const [activeSpend, setActiveSpend] = useState<SpendTarget | null>(null);
  const [expandedWeeks, setExpandedWeeks] = useState<Record<number, boolean>>({});
  const [showEarlierWeeks, setShowEarlierWeeks] = useState(false);
  const [wrappingWeek, setWrappingWeek] = useState<number | null>(null);
  const [wrappedWeeks, setWrappedWeeks] = useState<Record<number, WeekStatus>>({});
  const [spendDraft, setSpendDraft] = useState<SpendDraft>({
    itemId: "",
    amount: "",
    paymentMethod: "checking",
    date: todayISODate(),
    note: "",
  });

  const monthKey = monthKeyFor(year, month);
  const monthName = useMemo(() => new Date(year, month, 1).toLocaleString("en-US", { month: "long", year: "numeric" }), [month, year]);
  const weeks = useMemo(() => getCalendarWeeksForMonth(year, month), [month, year]);
  const today = useMemo(() => new Date(now.getFullYear(), now.getMonth(), now.getDate()), [now]);
  const monthStart = useMemo(() => new Date(year, month, 1), [month, year]);
  const monthEnd = useMemo(() => new Date(year, month + 1, 0), [month, year]);
  const defaultSpendDate = useMemo(() => (
    today >= monthStart && today <= monthEnd ? todayISODate() : isoDate(monthStart)
  ), [monthEnd, monthStart, today]);

  const budgetRows = useMemo(() => settings?.lineItems.filter((item) => !item.isIncome) ?? [], [settings]);
  const weeklyRows = useMemo(() => budgetRows.filter((item) => getRipplePlanType(item) !== "monthly_allowance"), [budgetRows]);
  const monthlyRows = useMemo(() => budgetRows.filter((item) => getRipplePlanType(item) === "monthly_allowance"), [budgetRows]);
  const rowsById = useMemo(() => new Map(budgetRows.map((item) => [item.id, item])), [budgetRows]);
  const currentWeekIndex = useMemo(() => weekIndexForDate(weeks, now), [now, weeks]);
  const selectedItem = rowsById.get(spendDraft.itemId) ?? budgetRows[0];

  const weekIndices = weeks.map((_, index) => index);
  const earlierWeekIndices = currentWeekIndex >= 0
    ? weekIndices.filter((index) => index < currentWeekIndex).reverse()
    : monthEnd < today ? [...weekIndices].reverse() : [];
  const futureWeekIndices = currentWeekIndex >= 0
    ? weekIndices.filter((index) => index > currentWeekIndex)
    : monthStart > today ? weekIndices : [];
  const laterThisMonthWeekIndices = futureWeekIndices.filter((weekIndex) => weekRows(weekIndex).length > 0);

  const monthlyPlanRows = useMemo(() => monthlyRows.map((item) => {
    const spent = spendLogs.filter((entry) => entry.rippleId === item.id).reduce((sum, entry) => sum + entry.amount, 0);
    const budgeted = weeks.reduce((sum, week, weekIndex) => (
      sum + budgetedForItemWeek(amounts, item, week, weekIndex, month, weeks.length, year)
    ), 0);
    return { item, budgeted, spent, remaining: budgeted - spent };
  }).filter((row) => row.budgeted > 0 || row.spent > 0), [amounts, month, monthlyRows, spendLogs, weeks, year]);
  const recentSpendLogs = useMemo(() => [...spendLogs].sort((a, b) => (
    b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)
  )), [spendLogs]);

  const totals = useMemo(() => {
    const weeklyBudgeted = weeklyRows.reduce((sum, item) => (
      sum + weeks.reduce((weekSum, week, weekIndex) => (
        weekSum + budgetedForItemWeek(amounts, item, week, weekIndex, month, weeks.length, year)
      ), 0)
    ), 0);
    const monthlyBudgeted = monthlyPlanRows.reduce((sum, row) => sum + row.budgeted, 0);
    const spent = spendLogs.reduce((sum, entry) => sum + entry.amount, 0);
    const budgeted = weeklyBudgeted + monthlyBudgeted;
    return { budgeted, spent, remaining: budgeted - spent };
  }, [amounts, month, monthlyPlanRows, spendLogs, weeklyRows, weeks, year]);
  const currentForward = useMemo(() => settings ? buildCurrentForwardBudgetSummary({
    settings,
    weeks,
    month,
    year,
    amounts,
    spendLogs,
    today,
  }) : null, [amounts, month, settings, spendLogs, today, weeks, year]);
  const shouldUseForwardSummary = Boolean(currentForward && monthEnd >= today);

  useEffect(() => {
    let cancelled = false;
    async function loadInitial() {
      const savedSettings = await loadSettingsWithSupabaseFallback();
      if (cancelled) return;
      if (!savedSettings) {
        router.push("/setup");
        return;
      }
      const firstBudgetRow = savedSettings.lineItems.find((item) => !item.isIncome);
      setSettings(savedSettings);
      setSpendDraft((draft) => ({
        ...draft,
        itemId: firstBudgetRow?.id ?? "",
        paymentMethod: firstBudgetRow?.paymentMethod ?? savedSettings.creditCards[0]?.id ?? "checking",
      }));
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
    async function loadMonth() {
      setMonthLoading(true);
      const [savedAmounts, savedSpendLogs, savedDockStates] = await Promise.all([
        budgetRepo.getMonthlyAmounts(monthKey),
        budgetRepo.getSpendLogs(monthKey),
        budgetRepo.getDockItemStates(monthKey),
      ]);
      if (cancelled) return;
      setAmounts(buildProjectedAmounts(activeSettings, weeks, month, savedAmounts));
      setSpendLogs(savedSpendLogs);
      setDockStates(savedDockStates);
      setMonthLoading(false);
    }
    void loadMonth();
    return () => {
      cancelled = true;
    };
  }, [month, monthKey, settings, weeks]);

  useEffect(() => {
    if (!activeSpend) return;
    window.requestAnimationFrame(() => {
      const form = document.getElementById("budget-spend-form");
      form?.scrollIntoView({ behavior: "smooth", block: "center" });
      form?.querySelector<HTMLInputElement>("[data-spend-amount]")?.focus();
    });
  }, [activeSpend]);

  function changeMonth(value: string) {
    const [nextYear, nextMonth] = value.split("-").map(Number);
    if (!nextYear || !nextMonth) return;
    setYear(nextYear);
    setMonth(nextMonth - 1);
    resetTransientUi();
  }

  function nudgeMonth(delta: number) {
    const next = addMonths(year, month, delta);
    setYear(next.year);
    setMonth(next.month);
    resetTransientUi();
  }

  function resetTransientUi() {
    setActiveSpend(null);
    setExpandedWeeks({});
    setShowEarlierWeeks(false);
    setWrappingWeek(null);
    setWrappedWeeks({});
  }

  function defaultDateForWeek(weekIndex: number) {
    const week = weeks[weekIndex];
    if (!week) return defaultSpendDate;
    if (weekIndex === currentWeekIndex) return defaultSpendDate;
    const inMonthStart = week.start < monthStart ? monthStart : week.start;
    return isoDate(inMonthStart);
  }

  function openSpendForm(item: LineItem, weekIndex?: number) {
    setSpendDraft({
      itemId: item.id,
      amount: "",
      paymentMethod: item.paymentMethod,
      date: weekIndex !== undefined ? defaultDateForWeek(weekIndex) : defaultSpendDate,
      note: "",
    });
    setActiveSpend({ itemId: item.id, weekIndex });
    if (weekIndex !== undefined) {
      setExpandedWeeks((current) => ({ ...current, [weekIndex]: true }));
    }
  }

  function openGlobalSpend() {
    const item = selectedItem ?? budgetRows[0];
    if (!item) return;
    setSpendDraft({
      itemId: item.id,
      amount: "",
      paymentMethod: item.paymentMethod,
      date: defaultSpendDate,
      note: "",
    });
    setActiveSpend("global");
  }

  async function logSpend() {
    const item = rowsById.get(spendDraft.itemId);
    const amount = Number(spendDraft.amount);
    const date = new Date(`${spendDraft.date}T00:00:00`);
    const weekIndex = weekIndexForDate(weeks, date);
    if (!settings || !item || !Number.isFinite(amount) || amount <= 0 || weekIndex < 0) return;

    const saved = await budgetRepo.saveSpendLog({
      id: crypto.randomUUID(),
      monthKey,
      weekIndex,
      rippleId: item.id,
      amount,
      paymentMethod: spendDraft.paymentMethod,
      date: spendDraft.date,
      note: spendDraft.note.trim() || item.name,
      createdAt: new Date().toISOString(),
    });
    setSpendLogs((current) => [saved, ...current]);
    setSpendDraft((draft) => ({ ...draft, amount: "", note: "" }));
    setExpandedWeeks((current) => ({ ...current, [weekIndex]: true }));
    setActiveSpend(null);
  }

  async function deleteSpend(entry: SpendLogEntry) {
    await budgetRepo.deleteSpendLog(entry.monthKey, entry.id);
    setSpendLogs((current) => current.filter((candidate) => candidate.id !== entry.id));
  }

  async function saveUnderBudget(weekIndex: number, amount: number) {
    const nextWeek = weeks[Math.min(weekIndex + 1, weeks.length - 1)] ?? weeks[weekIndex];
    if (!nextWeek || amount <= 0) return;
    const saved = await budgetRepo.saveDockItemState({
      monthKey,
      weekIndex: Math.min(weekIndex + 1, weeks.length - 1),
      itemId: `one-time-cash:${crypto.randomUUID()}`,
      itemKind: "ripple",
      behaviorType: "fixed_bill",
      status: "upcoming",
      plannedAmount: amount,
      actualAmount: amount,
      pendingUntil: isoDate(nextWeek.start),
      note: "Save under-budget money",
    });
    setDockStates((current) => [saved, ...current]);
    setWrappedWeeks((current) => ({ ...current, [weekIndex]: "saved" }));
    setWrappingWeek(null);
  }

  function weekRows(weekIndex: number) {
    const week = weeks[weekIndex];
    if (!week) return [];
    return weeklyRows.map((item) => {
      const budgeted = budgetedForItemWeek(amounts, item, week, weekIndex, month, weeks.length, year);
      const spent = spendLogs.filter((entry) => entry.rippleId === item.id && entry.weekIndex === weekIndex).reduce((sum, entry) => sum + entry.amount, 0);
      return { item, budgeted, spent, remaining: budgeted - spent };
    }).filter((row) => row.budgeted > 0 || row.spent > 0);
  }

  function weekPerformance(weekIndex: number) {
    return weekRows(weekIndex).reduce<WeekPerformance>((sum, row) => ({
      budgeted: sum.budgeted + row.budgeted,
      spent: sum.spent + row.spent,
      remaining: sum.remaining + row.remaining,
    }), { budgeted: 0, spent: 0, remaining: 0 });
  }

  function savedStatusForWeek(weekIndex: number): WeekStatus | undefined {
    const savedForWeek = dockStates.some((state) => (
      state.note === "Save under-budget money" &&
      state.weekIndex === Math.min(weekIndex + 1, weeks.length - 1)
    ));
    return wrappedWeeks[weekIndex] ?? (savedForWeek ? "saved" : undefined);
  }

  function markWrapped(weekIndex: number, status: WeekStatus) {
    setWrappedWeeks((current) => ({ ...current, [weekIndex]: status }));
    setWrappingWeek(null);
  }

  if (!loaded || !settings) {
    return (
      <main className="flex flex-1 items-center justify-center bg-harbor-offwhite text-harbor-navy">
        <div className="rounded-lg border border-harbor-teal-light bg-white px-5 py-4 text-sm shadow-sm">Loading Budget...</div>
      </main>
    );
  }

  return (
    <main className="harbor-page flex-1 p-3 text-harbor-navy sm:p-4">
      <div className="mx-auto max-w-[1120px] space-y-4 sm:space-y-6">
        <header className="harbor-hero rounded-xl px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-white/70">Budget</p>
              <h1 className="mt-1 text-2xl font-bold sm:text-3xl">{monthName}</h1>
              <p className="mt-1 text-sm text-white/70">Planned spending, real spend, and what is left.</p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
              <button type="button" disabled={monthLoading} onClick={() => nudgeMonth(-1)} className="rounded-md border border-white/20 bg-white/10 px-3 py-2 text-sm font-semibold text-white disabled:opacity-45">Previous</button>
              <input type="month" disabled={monthLoading} value={monthKey} onChange={(event) => changeMonth(event.target.value)} className="rounded-md border border-white/20 bg-white px-3 py-2 text-sm font-semibold text-harbor-navy disabled:opacity-45" />
              <button type="button" disabled={monthLoading} onClick={() => nudgeMonth(1)} className="rounded-md border border-white/20 bg-white/10 px-3 py-2 text-sm font-semibold text-white disabled:opacity-45">Next</button>
              <button type="button" onClick={openGlobalSpend} className="harbor-action px-4 py-2 text-sm">+ Log Spending</button>
            </div>
          </div>
        </header>

        {shouldUseForwardSummary && currentForward ? (
          <section className="grid gap-2 sm:gap-3 md:grid-cols-[1.4fr_1fr_1fr]">
            <Metric label="Remaining Budget" value={currentForward.restOfMonth.remainingPlannedSpending} detail="Known plan from today through month end" />
            <Metric label="Used Forward" value={currentForward.restOfMonth.spent} tone="red" detail="Recorded in the current actionable period" />
            <Metric label="Forward Room" value={currentForward.restOfMonth.availablePosition} tone={currentForward.restOfMonth.availablePosition >= 0 ? "green" : "red"} detail="Remaining plan minus forward spending" />
          </section>
        ) : (
          <section className="grid gap-2 sm:gap-3 md:grid-cols-3">
            <Metric label="Budgeted" value={totals.budgeted} />
            <Metric label="Spent" value={totals.spent} tone="red" />
            <Metric label="Remaining" value={totals.remaining} tone={totals.remaining >= 0 ? "green" : "red"} />
          </section>
        )}

        {activeSpend === "global" && (
          <SpendForm
            title="Log Spending"
            draft={spendDraft}
            items={budgetRows}
            settings={settings}
            onChange={setSpendDraft}
            onSave={logSpend}
            onCancel={() => setActiveSpend(null)}
            showPlan
          />
        )}

        {currentWeekIndex >= 0 && (
          <WeekSection
            title="This Week"
            weekIndex={currentWeekIndex}
            weekLabel={weeks[currentWeekIndex]?.label ?? ""}
            rows={weekRows(currentWeekIndex)}
            performance={weekPerformance(currentWeekIndex)}
            status={savedStatusForWeek(currentWeekIndex)}
            isExpanded
            isFeatured
            isPast={false}
            isWrapping={wrappingWeek === currentWeekIndex}
            activeSpend={activeSpend}
            settings={settings}
            spendDraft={spendDraft}
            rowsById={rowsById}
            onOpenSpend={openSpendForm}
            onChangeSpend={setSpendDraft}
            onSaveSpend={logSpend}
            onCancelSpend={() => setActiveSpend(null)}
            onToggle={() => undefined}
            onStartWrap={() => setWrappingWeek(currentWeekIndex)}
            onCancelWrap={() => setWrappingWeek(null)}
            onSaveWrap={() => void saveUnderBudget(currentWeekIndex, weekPerformance(currentWeekIndex).remaining)}
            onLeaveWrap={() => markWrapped(currentWeekIndex, "left")}
            onOverWrap={() => markWrapped(currentWeekIndex, "over")}
          />
        )}

        {laterThisMonthWeekIndices.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-sm font-bold uppercase tracking-wide text-harbor-navy/50">Later This Month</h2>
            {laterThisMonthWeekIndices.map((weekIndex) => (
              <WeekSection
                key={weeks[weekIndex]?.label}
                title={weeks[weekIndex]?.label ?? ""}
                weekIndex={weekIndex}
                weekLabel={weeks[weekIndex]?.label ?? ""}
                rows={weekRows(weekIndex)}
                performance={weekPerformance(weekIndex)}
                status={savedStatusForWeek(weekIndex)}
                isExpanded={Boolean(expandedWeeks[weekIndex])}
                isFeatured={false}
                isPast={false}
                isWrapping={false}
                activeSpend={activeSpend}
                settings={settings}
                spendDraft={spendDraft}
                rowsById={rowsById}
                onOpenSpend={openSpendForm}
                onChangeSpend={setSpendDraft}
                onSaveSpend={logSpend}
                onCancelSpend={() => setActiveSpend(null)}
                onToggle={() => setExpandedWeeks((current) => ({ ...current, [weekIndex]: !current[weekIndex] }))}
                onStartWrap={() => undefined}
                onCancelWrap={() => undefined}
                onSaveWrap={() => undefined}
                onLeaveWrap={() => undefined}
                onOverWrap={() => undefined}
              />
            ))}
          </section>
        )}

        {currentForward && (
          <MonthOverview
            monthName={monthName}
            summary={currentForward}
            showEarlierWeeks={showEarlierWeeks}
            onToggleEarlierWeeks={() => setShowEarlierWeeks((current) => !current)}
          />
        )}

        {showEarlierWeeks && earlierWeekIndices.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-sm font-bold uppercase tracking-wide text-harbor-navy/50">Earlier Weeks</h2>
            {earlierWeekIndices.map((weekIndex) => (
              <WeekSection
                key={weeks[weekIndex]?.label}
                title={weeks[weekIndex]?.label ?? ""}
                weekIndex={weekIndex}
                weekLabel={weeks[weekIndex]?.label ?? ""}
                rows={weekRows(weekIndex)}
                performance={weekPerformance(weekIndex)}
                status={savedStatusForWeek(weekIndex)}
                isExpanded={Boolean(expandedWeeks[weekIndex]) || activeSpend !== null && activeSpend !== "global" && activeSpend.weekIndex === weekIndex || wrappingWeek === weekIndex}
                isFeatured={false}
                isPast
                isWrapping={wrappingWeek === weekIndex}
                activeSpend={activeSpend}
                settings={settings}
                spendDraft={spendDraft}
                rowsById={rowsById}
                onOpenSpend={openSpendForm}
                onChangeSpend={setSpendDraft}
                onSaveSpend={logSpend}
                onCancelSpend={() => setActiveSpend(null)}
                onToggle={() => setExpandedWeeks((current) => ({ ...current, [weekIndex]: !current[weekIndex] }))}
                onStartWrap={() => {
                  setExpandedWeeks((current) => ({ ...current, [weekIndex]: true }));
                  setWrappingWeek(weekIndex);
                }}
                onCancelWrap={() => setWrappingWeek(null)}
                onSaveWrap={() => void saveUnderBudget(weekIndex, weekPerformance(weekIndex).remaining)}
                onLeaveWrap={() => markWrapped(weekIndex, "left")}
                onOverWrap={() => markWrapped(weekIndex, "over")}
              />
            ))}
          </section>
        )}

        {monthlyPlanRows.length > 0 && (
          <MonthlyPlans
            rows={monthlyPlanRows}
            activeSpend={activeSpend}
            spendDraft={spendDraft}
            settings={settings}
            rowsById={rowsById}
            onOpenSpend={openSpendForm}
            onChangeSpend={setSpendDraft}
            onSaveSpend={logSpend}
            onCancelSpend={() => setActiveSpend(null)}
          />
        )}

        {recentSpendLogs.length > 0 && (
          <SpendingLog
            entries={recentSpendLogs}
            rowsById={rowsById}
            settings={settings}
            onDelete={deleteSpend}
          />
        )}
      </div>
    </main>
  );
}

function MonthOverview({
  monthName,
  summary,
  showEarlierWeeks,
  onToggleEarlierWeeks,
}: {
  monthName: string;
  summary: ReturnType<typeof buildCurrentForwardBudgetSummary>;
  showEarlierWeeks: boolean;
  onToggleEarlierWeeks: () => void;
}) {
  return (
    <section className="border-t border-slate-200 pt-4">
      <div className="rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-white px-4 py-3 shadow-sm md:flex md:items-center md:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-harbor-navy/45">{monthName} Overview</div>
          <p className="mt-1 text-sm text-harbor-navy/55">
            Planned {formatMoney(summary.monthPosition.plannedSpending)} | Recorded spending {formatMoney(summary.monthPosition.spentSoFar)} | Earlier weeks {summary.earlierWeekCount}
          </p>
        </div>
        {summary.earlierWeekCount > 0 && (
          <button type="button" onClick={onToggleEarlierWeeks} className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-harbor-teal">
            {showEarlierWeeks ? "Hide Earlier Weeks" : `Show ${summary.earlierWeekCount} Earlier Weeks`}
          </button>
        )}
      </div>
    </section>
  );
}

function Metric({ label, value, tone = "navy", detail }: { label: string; value: number; tone?: "navy" | "green" | "red"; detail?: string }) {
  const toneClass = tone === "red" ? "text-harbor-red" : tone === "green" ? "text-harbor-teal" : "text-harbor-navy";
  const accentClass = tone === "red" ? "from-red-50 to-white border-red-100" : tone === "green" ? "from-emerald-50 to-white border-emerald-100" : "from-cyan-50 to-white border-cyan-100";
  return (
    <div className={`rounded-lg border bg-gradient-to-br px-3 py-2.5 shadow-sm sm:px-4 sm:py-3 ${accentClass}`}>
      <div className="text-xs font-semibold uppercase tracking-wide text-harbor-navy/50">{label}</div>
      <div className={`mt-1 text-xl font-bold tabular-nums sm:text-2xl ${toneClass}`}>{formatMoney(value)}</div>
      {detail && <div className="mt-1 text-xs text-harbor-navy/50 sm:block">{detail}</div>}
    </div>
  );
}

function WeekSection({
  title,
  weekIndex,
  weekLabel,
  rows,
  performance,
  status,
  isExpanded,
  isFeatured,
  isPast,
  isWrapping,
  activeSpend,
  settings,
  spendDraft,
  rowsById,
  onOpenSpend,
  onChangeSpend,
  onSaveSpend,
  onCancelSpend,
  onToggle,
  onStartWrap,
  onCancelWrap,
  onSaveWrap,
  onLeaveWrap,
  onOverWrap,
}: {
  title: string;
  weekIndex: number;
  weekLabel: string;
  rows: BudgetRow[];
  performance: WeekPerformance;
  status?: WeekStatus;
  isExpanded: boolean;
  isFeatured: boolean;
  isPast: boolean;
  isWrapping: boolean;
  activeSpend: SpendTarget | null;
  settings: AppSettings;
  spendDraft: SpendDraft;
  rowsById: Map<string, LineItem>;
  onOpenSpend: (item: LineItem, weekIndex?: number) => void;
  onChangeSpend: React.Dispatch<React.SetStateAction<SpendDraft>>;
  onSaveSpend: () => void | Promise<void>;
  onCancelSpend: () => void;
  onToggle: () => void;
  onStartWrap: () => void;
  onCancelWrap: () => void;
  onSaveWrap: () => void;
  onLeaveWrap: () => void;
  onOverWrap: () => void;
}) {
  const grouped = groupRowsByChart(rows);
  const underOverLabel = performance.remaining >= 0 ? `${formatMoney(performance.remaining)} under` : `${formatMoney(Math.abs(performance.remaining))} over`;
  const activeInlineSpend = activeSpend !== null && activeSpend !== "global" && activeSpend.weekIndex === weekIndex ? activeSpend : null;
  const quietClass = isPast || status ? "border-slate-200 bg-white/70" : "border-white bg-white/85";

  return (
    <section className={`${isFeatured ? "border-harbor-teal bg-gradient-to-br from-white to-teal-50 shadow-sm" : quietClass} border ${isFeatured ? "rounded-xl p-3 sm:p-4" : "rounded-xl px-3 py-3 shadow-sm sm:px-4"}`}>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className={`${isFeatured ? "text-2xl" : "text-base"} font-bold`}>{title}</h2>
            {isFeatured && <span className="rounded-full bg-harbor-teal/10 px-2 py-0.5 text-xs font-semibold text-harbor-teal">{weekLabel}</span>}
            {!isFeatured && status && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-harbor-navy/55">Wrapped</span>}
          </div>
          {!isFeatured && <p className="mt-1 text-sm font-semibold text-harbor-navy/70">{underOverLabel}</p>}
          <p className={`${isFeatured ? "mt-2 text-sm" : "text-xs"} text-harbor-navy/55`}>
            Budgeted {formatMoney(performance.budgeted)} | Spent {formatMoney(performance.spent)} | Remaining {formatMoney(performance.remaining)}
          </p>
          {status && <p className="mt-1 text-xs font-semibold text-harbor-navy/50">Outcome: {wrapOutcomeLabel(status, performance.remaining)}</p>}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {!isFeatured && (
            <button type="button" onClick={onToggle} className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-harbor-navy/65">
              {isExpanded ? "Collapse" : "Inspect"}
            </button>
          )}
          {isPast && !status && !isWrapping && performance.budgeted > 0 && (
            <button type="button" onClick={onStartWrap} className="rounded-md bg-harbor-teal px-3 py-1.5 text-xs font-semibold text-white">Wrap Week</button>
          )}
        </div>
      </div>

      {isWrapping && (
        <WrapDecision
          performance={performance}
          onSave={onSaveWrap}
          onLeave={onLeaveWrap}
          onOver={onOverWrap}
          onCancel={onCancelWrap}
        />
      )}

      {isExpanded && (
        <div className={`${isFeatured ? "mt-4" : "mt-3"} space-y-4`}>
          {rows.length === 0 ? (
            <p className="text-sm text-harbor-navy/45">No budget activity in this week.</p>
          ) : (
            Object.entries(grouped).map(([chart, chartRows]) => (
              <ChartRows key={chart} chart={chart} rows={chartRows} weekIndex={weekIndex} onOpenSpend={onOpenSpend} />
            ))
          )}
          {activeInlineSpend && (
            <SpendForm
              title={`Log ${rowsById.get(activeInlineSpend.itemId)?.name ?? "Spending"}`}
              draft={spendDraft}
              items={[]}
              settings={settings}
              onChange={onChangeSpend}
              onSave={onSaveSpend}
              onCancel={onCancelSpend}
            />
          )}
        </div>
      )}
    </section>
  );
}

function ChartRows({ chart, rows, weekIndex, onOpenSpend }: {
  chart: string;
  rows: BudgetRow[];
  weekIndex?: number;
  onOpenSpend: (item: LineItem, weekIndex?: number) => void;
}) {
  const subtotal = rows.reduce<WeekPerformance>((sum, row) => ({
    budgeted: sum.budgeted + row.budgeted,
    spent: sum.spent + row.spent,
    remaining: sum.remaining + row.remaining,
  }), { budgeted: 0, spent: 0, remaining: 0 });
  const accent = chartAccent(chart);

  return (
    <section className={`overflow-hidden rounded-xl border bg-white shadow-sm ${accent.border}`}>
      <div className={`border-b px-4 py-3 ${accent.header}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-bold uppercase tracking-wide text-harbor-navy">{chart}</h3>
            <p className="mt-0.5 text-xs font-medium text-harbor-navy/55">
              {formatMoney(subtotal.budgeted)} planned | {formatMoney(subtotal.spent)} spent
            </p>
          </div>
          <div className={`shrink-0 text-right text-lg font-bold tabular-nums ${subtotal.remaining < 0 ? "text-harbor-red" : accent.amount}`}>
            {formatMoney(subtotal.remaining)}
            <div className="text-xs font-semibold text-harbor-navy/45">left</div>
          </div>
        </div>
      </div>
      <div className="divide-y divide-slate-100 px-4">
        {rows.map((row) => (
          <div key={row.item.id} className="grid gap-2 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <div className="min-w-0 sm:pr-4">
              <div className="truncate text-base font-semibold text-harbor-navy sm:text-sm">{row.item.name}</div>
              <div className="mt-0.5 text-xs font-medium text-harbor-navy/50">
                {formatMoney(row.budgeted)} planned | {formatMoney(row.spent)} spent
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 sm:justify-end">
              <div className={`text-right text-base font-bold tabular-nums ${row.remaining < 0 ? "text-harbor-red" : "text-harbor-navy"}`}>
                {formatMoney(row.remaining)}
                <span className="ml-1 text-xs font-semibold text-harbor-navy/45">left</span>
              </div>
              <button type="button" onClick={() => onOpenSpend(row.item, weekIndex)} className={`min-h-10 shrink-0 rounded-md border bg-white px-3 py-1.5 text-xs font-semibold hover:text-white ${accent.button}`}>+ Spend</button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function chartAccent(chart: string) {
  const accents = [
    { border: "border-cyan-200", header: "border-cyan-100 bg-cyan-50", amount: "text-cyan-800", button: "border-cyan-200 text-cyan-700 hover:bg-cyan-700" },
    { border: "border-emerald-200", header: "border-emerald-100 bg-emerald-50", amount: "text-emerald-800", button: "border-emerald-200 text-emerald-700 hover:bg-emerald-700" },
    { border: "border-rose-200", header: "border-rose-100 bg-rose-50", amount: "text-rose-800", button: "border-rose-200 text-rose-700 hover:bg-rose-700" },
    { border: "border-amber-200", header: "border-amber-100 bg-amber-50", amount: "text-amber-800", button: "border-amber-200 text-amber-700 hover:bg-amber-700" },
    { border: "border-indigo-200", header: "border-indigo-100 bg-indigo-50", amount: "text-indigo-800", button: "border-indigo-200 text-indigo-700 hover:bg-indigo-700" },
  ];
  const index = [...chart].reduce((sum, char) => sum + char.charCodeAt(0), 0) % accents.length;
  return accents[index];
}

function WrapDecision({ performance, onSave, onLeave, onOver, onCancel }: {
  performance: WeekPerformance;
  onSave: () => void;
  onLeave: () => void;
  onOver: () => void;
  onCancel: () => void;
}) {
  if (performance.remaining >= 0) {
    return (
      <div className="mt-3 rounded-md border border-harbor-teal-light bg-harbor-offwhite px-3 py-3">
        <p className="text-sm font-semibold text-harbor-green">You finished {formatMoney(performance.remaining)} under budget.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={onSave} className="rounded-md bg-harbor-teal px-3 py-1.5 text-xs font-semibold text-white">Save {formatMoney(performance.remaining)}</button>
          <button type="button" onClick={onLeave} className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-harbor-navy/65">Leave It</button>
          <button type="button" onClick={onCancel} className="rounded-md px-3 py-1.5 text-xs font-semibold text-harbor-navy/45">Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-md border border-slate-200 bg-white px-3 py-3">
      <p className="text-sm font-semibold text-harbor-red">You finished {formatMoney(Math.abs(performance.remaining))} over budget.</p>
      <p className="mt-1 text-xs text-harbor-navy/50">The additional spending is already reflected in your future cash forecast.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={onOver} className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-harbor-navy/65">Acknowledge</button>
        <button type="button" onClick={onCancel} className="rounded-md px-3 py-1.5 text-xs font-semibold text-harbor-navy/45">Cancel</button>
      </div>
    </div>
  );
}

function MonthlyPlans({
  rows,
  activeSpend,
  spendDraft,
  settings,
  rowsById,
  onOpenSpend,
  onChangeSpend,
  onSaveSpend,
  onCancelSpend,
}: {
  rows: BudgetRow[];
  activeSpend: SpendTarget | null;
  spendDraft: SpendDraft;
  settings: AppSettings;
  rowsById: Map<string, LineItem>;
  onOpenSpend: (item: LineItem, weekIndex?: number) => void;
  onChangeSpend: React.Dispatch<React.SetStateAction<SpendDraft>>;
  onSaveSpend: () => void | Promise<void>;
  onCancelSpend: () => void;
}) {
  const grouped = groupRowsByChart(rows);
  const activeMonthlySpend = activeSpend !== null && activeSpend !== "global" && activeSpend.weekIndex === undefined ? activeSpend : null;

  return (
    <section className="border-t border-harbor-teal-light pt-5">
      <h2 className="text-xl font-bold">Monthly Plans</h2>
      <div className="mt-4 space-y-5">
        {Object.entries(grouped).map(([chart, chartRows]) => (
          <ChartRows key={chart} chart={chart} rows={chartRows} onOpenSpend={onOpenSpend} />
        ))}
      </div>
      {activeMonthlySpend && (
        <SpendForm
          title={`Log ${rowsById.get(activeMonthlySpend.itemId)?.name ?? "Spending"}`}
          draft={spendDraft}
          items={[]}
          settings={settings}
          onChange={onChangeSpend}
          onSave={onSaveSpend}
          onCancel={onCancelSpend}
        />
      )}
    </section>
  );
}

function SpendingLog({ entries, rowsById, settings, onDelete }: {
  entries: SpendLogEntry[];
  rowsById: Map<string, LineItem>;
  settings: AppSettings;
  onDelete: (entry: SpendLogEntry) => void | Promise<void>;
}) {
  return (
    <section className="border-t border-slate-200 pt-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-xl font-bold">Spending Log</h2>
        <p className="text-xs text-harbor-navy/45">Remove mistaken entries here.</p>
      </div>
      <div className="mt-3 hidden md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase tracking-wide text-harbor-navy/40">
              <th className="py-2 pr-3">Date</th>
              <th className="px-3 py-2">Plan</th>
              <th className="px-3 py-2">Payment</th>
              <th className="px-3 py-2">Note</th>
              <th className="px-3 py-2 text-right">Amount</th>
              <th className="py-2 pl-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => {
              const item = rowsById.get(entry.rippleId);
              const date = new Date(`${entry.date}T00:00:00`);
              return (
                <tr key={entry.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 pr-3 font-medium">{formatShortDate(date)}</td>
                  <td className="px-3 py-2 font-semibold">{item?.name ?? "Deleted plan"}</td>
                  <td className="px-3 py-2 text-harbor-navy/60">{paymentMethodLabel(entry.paymentMethod, settings)}</td>
                  <td className="px-3 py-2 text-harbor-navy/55">{entry.note ?? ""}</td>
                  <td className="px-3 py-2 text-right font-bold">{formatMoney(entry.amount)}</td>
                  <td className="py-2 pl-3 text-right">
                    <button type="button" onClick={() => void onDelete(entry)} className="rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-harbor-red hover:border-harbor-red/30 hover:bg-red-50">Delete</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-3 divide-y divide-slate-100 md:hidden">
        {entries.map((entry) => {
          const item = rowsById.get(entry.rippleId);
          const date = new Date(`${entry.date}T00:00:00`);
          return (
            <div key={entry.id} className="py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-semibold">{item?.name ?? "Deleted plan"}</div>
                  <div className="mt-0.5 text-xs text-harbor-navy/50">{item?.category ?? "Budget"} | {paymentMethodLabel(entry.paymentMethod, settings)} | {formatShortDate(date)}</div>
                  {entry.note && <div className="mt-1 text-sm text-harbor-navy/55">{entry.note}</div>}
                </div>
                <div className="shrink-0 text-right font-bold tabular-nums">{formatMoney(entry.amount)}</div>
              </div>
              <div className="mt-2 flex justify-end">
                <button type="button" onClick={() => void onDelete(entry)} className="rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold text-harbor-red">Delete</button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function SpendForm({
  title,
  draft,
  items,
  settings,
  onChange,
  onSave,
  onCancel,
  showPlan = false,
}: {
  title: string;
  draft: SpendDraft;
  items: LineItem[];
  settings: AppSettings;
  onChange: React.Dispatch<React.SetStateAction<SpendDraft>>;
  onSave: () => void | Promise<void>;
  onCancel: () => void;
  showPlan?: boolean;
}) {
  const selected = items.find((item) => item.id === draft.itemId);
  return (
    <div id="budget-spend-form" className="mt-4 rounded-xl border border-teal-200 bg-teal-50 p-3 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-bold">{title}</h3>
        <button type="button" onClick={onCancel} className="text-xs font-semibold text-harbor-navy/45">Close</button>
      </div>
      <div className={`grid gap-2 ${showPlan ? "md:grid-cols-[1.5fr_1fr_1fr_1fr]" : "md:grid-cols-4"}`}>
        {showPlan && (
          <select className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm" value={draft.itemId} onChange={(event) => {
            const item = items.find((candidate) => candidate.id === event.target.value);
            onChange((current) => ({ ...current, itemId: event.target.value, paymentMethod: item?.paymentMethod ?? current.paymentMethod }));
          }}>
            {items.map((item) => <option key={item.id} value={item.id}>{item.category} | {item.name}</option>)}
          </select>
        )}
        <input data-spend-amount className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm" type="number" min="0" step="0.01" placeholder="Amount" value={draft.amount} onChange={(event) => onChange((current) => ({ ...current, amount: event.target.value }))} />
        <select className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm" value={draft.paymentMethod} onChange={(event) => onChange((current) => ({ ...current, paymentMethod: event.target.value as PaymentMethod }))}>
          <option value="checking">Checking</option>
          {settings.creditCards.map((card) => <option key={card.id} value={card.id}>{card.label}</option>)}
        </select>
        <input className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm" type="date" value={draft.date} onChange={(event) => onChange((current) => ({ ...current, date: event.target.value }))} />
        <input className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm" placeholder="Note" value={draft.note} onChange={(event) => onChange((current) => ({ ...current, note: event.target.value }))} />
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-harbor-navy/50">{selected && (isCardMethod(draft.paymentMethod) ? "Budget updates now. Dock sees the future card payment." : `Budget updates now. Dock uses ${paymentMethodLabel(draft.paymentMethod, settings)} cash timing.`)}</p>
        <button type="button" onClick={() => void onSave()} className="rounded-md bg-harbor-teal px-4 py-2 text-sm font-semibold text-white">Log</button>
      </div>
    </div>
  );
}

function groupRowsByChart(rows: BudgetRow[]) {
  return rows.reduce<Record<string, BudgetRow[]>>((result, row) => {
    const chart = row.item.category || "Other";
    return { ...result, [chart]: [...(result[chart] ?? []), row] };
  }, {});
}

function wrapOutcomeLabel(status: WeekStatus, remaining: number) {
  if (status === "saved") return `Saved ${formatMoney(Math.max(remaining, 0))}`;
  if (status === "over") return "Overspend acknowledged";
  return "Left in checking";
}
