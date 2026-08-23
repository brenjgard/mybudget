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

  const monthlyPlanRows = useMemo(() => monthlyRows.map((item) => {
    const spent = spendLogs.filter((entry) => entry.rippleId === item.id).reduce((sum, entry) => sum + entry.amount, 0);
    return { item, budgeted: item.defaultAmount, spent, remaining: item.defaultAmount - spent };
  }).filter((row) => row.budgeted > 0 || row.spent > 0), [monthlyRows, spendLogs]);
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
    <main className="flex-1 bg-harbor-offwhite p-4 text-harbor-navy">
      <div className="mx-auto max-w-[1180px] space-y-6">
        <header className="border-b border-harbor-teal-light py-3">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-harbor-teal">Budget</p>
              <h1 className="mt-1 text-3xl font-bold">{monthName}</h1>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" disabled={monthLoading} onClick={() => nudgeMonth(-1)} className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold disabled:opacity-45">Previous</button>
              <input type="month" disabled={monthLoading} value={monthKey} onChange={(event) => changeMonth(event.target.value)} className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold disabled:opacity-45" />
              <button type="button" disabled={monthLoading} onClick={() => nudgeMonth(1)} className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold disabled:opacity-45">Next</button>
              <button type="button" onClick={openGlobalSpend} className="rounded-md bg-harbor-teal px-4 py-2 text-sm font-semibold text-white">+ Log Spending</button>
            </div>
          </div>
        </header>

        <section className="grid gap-3 md:grid-cols-3">
          <Metric label="Budgeted" value={totals.budgeted} />
          <Metric label="Spent" value={totals.spent} tone="red" />
          <Metric label="Remaining" value={totals.remaining} tone={totals.remaining >= 0 ? "green" : "red"} />
        </section>

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

        {earlierWeekIndices.length > 0 && (
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

        {futureWeekIndices.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-sm font-bold uppercase tracking-wide text-harbor-navy/50">Future</h2>
            {futureWeekIndices.map((weekIndex) => (
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

function Metric({ label, value, tone = "navy" }: { label: string; value: number; tone?: "navy" | "green" | "red" }) {
  const toneClass = tone === "green" ? "text-harbor-green" : tone === "red" ? "text-harbor-red" : "text-harbor-navy";
  return (
    <div className="border-b-2 border-harbor-teal-light bg-white px-4 py-3 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-wide text-harbor-navy/45">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${toneClass}`}>{formatMoney(value)}</div>
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
  const quietClass = isPast || status ? "border-slate-200 bg-white/70" : "border-harbor-teal-light bg-white";

  return (
    <section className={`${isFeatured ? "border-harbor-teal bg-white shadow-sm" : quietClass} border ${isFeatured ? "rounded-lg p-4" : "rounded-md px-4 py-3"}`}>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
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

        <div className="flex flex-wrap items-center gap-2">
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
        <div className={`${isFeatured ? "mt-5" : "mt-3"} space-y-5`}>
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

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 pb-1">
        <h3 className="text-xs font-bold uppercase tracking-wide text-harbor-navy/55">{chart}</h3>
        <p className="text-xs text-harbor-navy/45">Budgeted {formatMoney(subtotal.budgeted)} | Spent {formatMoney(subtotal.spent)} | Remaining {formatMoney(subtotal.remaining)}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold uppercase tracking-wide text-harbor-navy/40">
              <th className="py-2 pr-3">Plan</th>
              <th className="px-3 py-2 text-right">Budgeted</th>
              <th className="px-3 py-2 text-right">Spent</th>
              <th className="px-3 py-2 text-right">Remaining</th>
              <th className="py-2 pl-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.item.id} className="border-t border-slate-100">
                <td className="py-2 pr-3 font-semibold">{row.item.name}</td>
                <td className="px-3 py-2 text-right">{formatMoney(row.budgeted)}</td>
                <td className="px-3 py-2 text-right text-harbor-navy/70">{formatMoney(row.spent)}</td>
                <td className={`px-3 py-2 text-right font-bold ${row.remaining >= 0 ? "text-harbor-green" : "text-harbor-red"}`}>{formatMoney(row.remaining)}</td>
                <td className="py-2 pl-3 text-right">
                  <button type="button" onClick={() => onOpenSpend(row.item, weekIndex)} className="rounded-md border border-harbor-teal-light px-2 py-1 text-xs font-semibold text-harbor-teal">+ Spend</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
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
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
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
    <div className="mt-4 rounded-md border border-harbor-teal-light bg-harbor-offwhite p-3">
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
        <input className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm" type="number" min="0" step="0.01" placeholder="Amount" value={draft.amount} onChange={(event) => onChange((current) => ({ ...current, amount: event.target.value }))} />
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
