"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { loadSettingsWithSupabaseFallback } from "./lib/budget-settings";
import { budgetRepo } from "./lib/repositories/budget-repo";
import { getItemBehavior } from "./lib/ripple-type";
import { buildProjectedAmounts, getWeekRanges, lineItemAppliesToWeek } from "./lib/schedule";
import type { AppSettings, DockItemState, LineItem, PaymentMethod, SpendLogEntry } from "./lib/types";

type ViewMode = "budget" | "cash";
type DockGroup = "income" | "standardBills" | "food" | "pets" | "other" | "cardPayments";

type CardPaymentRow = {
  id: string;
  name: string;
  amount: number;
  weekIndex: number;
  date: string;
  status: DockItemState["status"];
  note?: string;
};

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function isoDate(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function monthKeyFor(year: number, month: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

function todayISODate() {
  return isoDate(new Date());
}

function cardPaymentId() {
  return `scheduled-card-payment:${crypto.randomUUID()}`;
}

function stateKey(itemId: string, weekIndex: number) {
  return `${itemId}-${weekIndex}`;
}

function isCardMethod(method: PaymentMethod) {
  return method !== "checking";
}

function methodLabel(method: PaymentMethod, settings: AppSettings) {
  if (method === "checking") return "Checking";
  return settings.creditCards.find((card) => card.id === method)?.label ?? "Credit card";
}

function amountForWeek(amounts: Record<string, Record<number, number>>, item: LineItem, weekIndex: number) {
  return Number(amounts[item.id]?.[weekIndex] ?? 0);
}

function hasWeekAmount(amounts: Record<string, Record<number, number>>, item: LineItem, weekIndex: number) {
  return amounts[item.id]?.[weekIndex] !== undefined;
}

function collapseStorageKey(monthKey: string) {
  return `harbor_dock_collapsed_${monthKey}`;
}

function getBudgetGroup(item: LineItem): DockGroup {
  const category = item.category.trim().toLowerCase();
  const name = item.name.trim().toLowerCase();
  if (category.includes("food") || name.includes("grocery") || name.includes("groceries") || name.includes("dining")) return "food";
  if (category.includes("pet") || name.includes("pet")) return "pets";
  if (item.paymentMethod === "checking") return "standardBills";
  return "other";
}

const GROUP_LABELS: Record<DockGroup, string> = {
  income: "Income",
  standardBills: "Standard Bills",
  food: "Food",
  pets: "Pets",
  other: "Other",
  cardPayments: "Credit Card Payments",
};

export default function Home() {
  const router = useRouter();
  const now = useMemo(() => new Date(), []);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [amounts, setAmounts] = useState<Record<string, Record<number, number>>>({});
  const [spendLogs, setSpendLogs] = useState<SpendLogEntry[]>([]);
  const [dockStates, setDockStates] = useState<DockItemState[]>([]);
  const [checkingBalance, setCheckingBalance] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [monthLoading, setMonthLoading] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("budget");
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [cardSpendDraft, setCardSpendDraft] = useState({ itemId: "", weekIndex: 0, amount: "", cardId: "", date: todayISODate() });
  const [paymentDraft, setPaymentDraft] = useState({ cardId: "", amount: "", date: todayISODate(), note: "" });

  const monthKey = monthKeyFor(year, month);
  const monthName = useMemo(
    () => new Date(year, month, 1).toLocaleString("en-US", { month: "long", year: "numeric" }),
    [month, year],
  );
  const weeks = useMemo(() => getWeekRanges(year, month), [month, year]);

  useEffect(() => {
    let cancelled = false;

    async function loadInitial() {
      const [savedSettings, savedAnchor] = await Promise.all([
        loadSettingsWithSupabaseFallback(),
        budgetRepo.getAnchorOverride(),
      ]);
      if (cancelled) return;
      if (!savedSettings) {
        router.push("/setup");
        return;
      }
      setSettings(savedSettings);
      setCheckingBalance(String(savedAnchor ?? savedSettings.checkingBalance ?? 0));
      setLoaded(true);
    }

    void loadInitial();
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (!settings) return;
    const monthSettings = settings;
    let cancelled = false;

    async function loadMonth() {
      setMonthLoading(true);
      setAmounts({});
      setSpendLogs([]);
      setDockStates([]);
      const [savedAmounts, savedSpendLogs, savedDockStates] = await Promise.all([
        budgetRepo.getMonthlyAmounts(monthKey),
        budgetRepo.getSpendLogs(monthKey),
        budgetRepo.getDockItemStates(monthKey),
      ]);
      if (cancelled) return;
      setAmounts(buildProjectedAmounts(monthSettings, weeks, month, savedAmounts));
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
    const timer = window.setTimeout(() => {
      try {
        setCollapsedGroups(JSON.parse(localStorage.getItem(collapseStorageKey(monthKey)) ?? "{}") as Record<string, boolean>);
      } catch {
        setCollapsedGroups({});
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [monthKey]);

  useEffect(() => {
    try {
      localStorage.setItem(collapseStorageKey(monthKey), JSON.stringify(collapsedGroups));
    } catch {
      // Local collapse state is a convenience only.
    }
  }, [collapsedGroups, monthKey]);

  const dockStatesByItemWeek = useMemo(() => {
    const result = new Map<string, DockItemState>();
    dockStates.forEach((state) => result.set(stateKey(state.itemId, state.weekIndex), state));
    return result;
  }, [dockStates]);

  const spendLogsByItemWeek = useMemo(() => {
    const result = new Map<string, SpendLogEntry[]>();
    spendLogs.forEach((entry) => {
      const key = stateKey(entry.rippleId, entry.weekIndex);
      result.set(key, [...(result.get(key) ?? []), entry]);
    });
    return result;
  }, [spendLogs]);

  const incomeRows = useMemo(
    () => settings?.lineItems.filter((item) => item.isIncome) ?? [],
    [settings],
  );

  const budgetRows = useMemo(
    () => settings?.lineItems.filter((item) => !item.isIncome && getItemBehavior(item) !== "credit_card_payment") ?? [],
    [settings],
  );

  const cardSpendRows = useMemo(
    () => budgetRows.filter((item) => isCardMethod(item.paymentMethod)),
    [budgetRows],
  );

  const budgetRowsByGroup = useMemo(() => {
    const groups: Record<Exclude<DockGroup, "income" | "cardPayments">, LineItem[]> = {
      standardBills: [],
      food: [],
      pets: [],
      other: [],
    };
    budgetRows.forEach((item) => {
      groups[getBudgetGroup(item) as Exclude<DockGroup, "income" | "cardPayments">].push(item);
    });
    return groups;
  }, [budgetRows]);

  const scheduledCardPayments = useMemo<CardPaymentRow[]>(() => (
    dockStates
      .filter((state) => state.itemId.startsWith("scheduled-card-payment:") && state.itemKind === "credit_card_payment")
      .map((state) => ({
        id: state.itemId,
        name: state.note || "Scheduled card payment",
        amount: Number(state.actualAmount ?? state.plannedAmount ?? 0),
        weekIndex: state.weekIndex,
        date: state.pendingUntil ?? (weeks[state.weekIndex]?.start ? isoDate(weeks[state.weekIndex].start) : ""),
        status: state.status,
        note: state.note,
      }))
      .filter((payment) => payment.amount > 0)
  ), [dockStates, weeks]);

  const startingChecking = Number(checkingBalance || 0);

  const weeklyCash = useMemo(() => {
    if (!settings) return [];
    let running = startingChecking;

    return weeks.map((week, weekIndex) => {
      const inflows = incomeRows.reduce((sum, item) => {
        if (!lineItemAppliesToWeek(item, weekIndex, week.start, week.end, month)) return sum;
        const state = dockStatesByItemWeek.get(stateKey(item.id, weekIndex));
        if (state?.status === "skipped" || state?.status === "cleared") return sum;
        return sum + Number(state?.actualAmount ?? amountForWeek(amounts, item, weekIndex));
      }, 0);

      const checkingOutflows = budgetRows.reduce((sum, item) => {
        if (isCardMethod(item.paymentMethod)) return sum;
        if (!lineItemAppliesToWeek(item, weekIndex, week.start, week.end, month) && !hasWeekAmount(amounts, item, weekIndex)) return sum;
        const state = dockStatesByItemWeek.get(stateKey(item.id, weekIndex));
        if (state?.status === "skipped") return sum;
        const actualCashSpend = (spendLogsByItemWeek.get(stateKey(item.id, weekIndex)) ?? [])
          .filter((entry) => entry.paymentMethod === "checking")
          .reduce((total, entry) => total + entry.amount, 0);
        return sum + Number(state?.actualAmount ?? (actualCashSpend || amountForWeek(amounts, item, weekIndex)));
      }, 0);

      const cardPayments = scheduledCardPayments
        .filter((payment) => payment.weekIndex === weekIndex && payment.status !== "skipped")
        .reduce((sum, payment) => sum + payment.amount, 0);

      const starting = running;
      running = running + inflows - checkingOutflows - cardPayments;
      return { starting, inflows, checkingOutflows, cardPayments, ending: running };
    });
  }, [amounts, budgetRows, dockStatesByItemWeek, incomeRows, month, scheduledCardPayments, settings, spendLogsByItemWeek, startingChecking, weeks]);

  const totals = useMemo(() => {
    const planned = budgetRows.reduce((sum, item) => (
      sum + weeks.reduce((weekSum, week, weekIndex) => {
        if (!lineItemAppliesToWeek(item, weekIndex, week.start, week.end, month) && !hasWeekAmount(amounts, item, weekIndex)) return weekSum;
        return weekSum + amountForWeek(amounts, item, weekIndex);
      }, 0)
    ), 0);
    const actual = spendLogs.reduce((sum, entry) => sum + entry.amount, 0);
    const cardSpend = spendLogs.filter((entry) => isCardMethod(entry.paymentMethod)).reduce((sum, entry) => sum + entry.amount, 0);
    const cardPayments = scheduledCardPayments.filter((payment) => payment.status !== "skipped").reduce((sum, payment) => sum + payment.amount, 0);
    return {
      planned,
      actual,
      remaining: Math.max(0, planned - actual),
      projectedChecking: weeklyCash.at(-1)?.ending ?? startingChecking,
      cardLiability: Math.max(0, cardSpend - cardPayments),
    };
  }, [amounts, budgetRows, month, scheduledCardPayments, spendLogs, startingChecking, weeklyCash, weeks]);

  function changeMonth(value: string) {
    const [nextYear, nextMonth] = value.split("-").map(Number);
    if (!nextYear || !nextMonth) return;
    setMonthLoading(true);
    setAmounts({});
    setSpendLogs([]);
    setDockStates([]);
    setYear(nextYear);
    setMonth(nextMonth - 1);
  }

  function nudgeMonth(delta: number) {
    const next = new Date(year, month + delta, 1);
    setMonthLoading(true);
    setAmounts({});
    setSpendLogs([]);
    setDockStates([]);
    setYear(next.getFullYear());
    setMonth(next.getMonth());
  }

  function toggleGroup(group: DockGroup) {
    setCollapsedGroups((current) => ({ ...current, [group]: !current[group] }));
  }

  function updatePlannedAmount(itemId: string, weekIndex: number, value: string) {
    const parsed = value === "" ? 0 : Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return;
    setAmounts((current) => ({
      ...current,
      [itemId]: {
        ...(current[itemId] ?? {}),
        [weekIndex]: parsed,
      },
    }));
  }

  async function saveMonthlyAmounts() {
    await budgetRepo.saveMonthlyAmounts(monthKey, amounts);
  }

  async function saveCheckingBalance() {
    const parsed = checkingBalance.trim() === "" ? null : Number(checkingBalance);
    if (parsed !== null && !Number.isFinite(parsed)) return;
    const saved = await budgetRepo.saveAnchorOverride(parsed);
    setCheckingBalance(String(saved ?? 0));
  }

  async function saveDockState(state: DockItemState) {
    const saved = await budgetRepo.saveDockItemState(state);
    setDockStates((current) => {
      const without = current.filter((item) => !(item.itemId === saved.itemId && item.itemKind === saved.itemKind && item.weekIndex === saved.weekIndex));
      return [...without, saved];
    });
  }

  async function markIncomeReceived(item: LineItem, weekIndex: number) {
    const amount = amountForWeek(amounts, item, weekIndex);
    if (amount <= 0) return;
    const existing = dockStatesByItemWeek.get(stateKey(item.id, weekIndex));
    if (existing?.status === "cleared") return;
    await saveDockState({
      ...existing,
      monthKey,
      weekIndex,
      itemId: item.id,
      itemKind: "wave",
      behaviorType: "income",
      status: "cleared",
      plannedAmount: amount,
      actualAmount: amount,
      clearedAt: new Date().toISOString(),
    });
  }

  async function markCheckingBillPaid(item: LineItem, weekIndex: number) {
    const amount = amountForWeek(amounts, item, weekIndex);
    if (amount <= 0) return;
    const existing = dockStatesByItemWeek.get(stateKey(item.id, weekIndex));
    if (existing?.status === "cleared") return;
    await saveDockState({
      ...existing,
      monthKey,
      weekIndex,
      itemId: item.id,
      itemKind: "ripple",
      behaviorType: getItemBehavior(item),
      status: "cleared",
      plannedAmount: amount,
      actualAmount: amount,
      clearedAt: new Date().toISOString(),
    });
  }

  async function skipDockItem(item: LineItem, weekIndex: number) {
    const amount = amountForWeek(amounts, item, weekIndex);
    const existing = dockStatesByItemWeek.get(stateKey(item.id, weekIndex));
    await saveDockState({
      ...existing,
      monthKey,
      weekIndex,
      itemId: item.id,
      itemKind: item.isIncome ? "wave" : "ripple",
      behaviorType: getItemBehavior(item),
      status: "skipped",
      plannedAmount: amount,
      actualAmount: 0,
      statusUpdatedAt: new Date().toISOString(),
    });
  }

  async function logCardSpend() {
    const item = cardSpendRows.find((row) => row.id === cardSpendDraft.itemId) ?? cardSpendRows[0];
    const amount = Number(cardSpendDraft.amount);
    const cardId = cardSpendDraft.cardId || item?.paymentMethod || settings?.creditCards[0]?.id;
    if (!settings || !item || !cardId || cardId === "checking" || !Number.isFinite(amount) || amount <= 0) return;
    const saved = await budgetRepo.saveSpendLog({
      id: crypto.randomUUID(),
      monthKey,
      weekIndex: Number(cardSpendDraft.weekIndex),
      rippleId: item.id,
      amount,
      paymentMethod: cardId,
      date: cardSpendDraft.date || isoDate(weeks[Number(cardSpendDraft.weekIndex)]?.start ?? new Date()),
      note: "Credit-card spend",
      createdAt: new Date().toISOString(),
    });
    setSpendLogs((current) => [saved, ...current]);
    setCardSpendDraft((draft) => ({ ...draft, itemId: item.id, cardId, amount: "" }));
  }

  async function scheduleCardPayment() {
    const amount = Number(paymentDraft.amount);
    if (!settings || !Number.isFinite(amount) || amount <= 0 || !paymentDraft.date) return;
    const paymentDate = new Date(`${paymentDraft.date}T00:00:00`);
    const weekIndex = weeks.findIndex((week) => paymentDate >= week.start && paymentDate <= week.end);
    if (weekIndex < 0) return;
    const card = settings.creditCards.find((candidate) => candidate.id === paymentDraft.cardId) ?? settings.creditCards[0];
    const label = card ? `${card.label} payment` : "Credit-card payment";
    await saveDockState({
      monthKey,
      weekIndex,
      itemId: cardPaymentId(),
      itemKind: "credit_card_payment",
      behaviorType: "credit_card_payment",
      status: "upcoming",
      plannedAmount: amount,
      actualAmount: amount,
      pendingUntil: paymentDraft.date,
      note: paymentDraft.note.trim() || label,
    });
    setPaymentDraft((draft) => ({ ...draft, amount: "", note: "", cardId: card?.id ?? draft.cardId }));
  }

  if (!loaded || !settings) {
    return (
      <main className="flex flex-1 items-center justify-center bg-harbor-offwhite text-harbor-navy">
        <div className="rounded-xl border border-harbor-teal-light bg-white px-5 py-4 text-sm shadow-sm">Loading Dock...</div>
      </main>
    );
  }

  return (
    <main className="flex-1 bg-harbor-offwhite p-4 text-harbor-navy">
      <div className="mx-auto max-w-[1500px] space-y-4">
        <section className="rounded-xl border border-harbor-teal-light bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-harbor-teal">Dock</p>
              <h1 className="mt-1 text-2xl font-bold">{monthName}</h1>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <button type="button" disabled={monthLoading} onClick={() => nudgeMonth(-1)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold disabled:opacity-45">Previous</button>
              <input type="month" disabled={monthLoading} value={monthKey} onChange={(event) => changeMonth(event.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold disabled:opacity-45" />
              <button type="button" disabled={monthLoading} onClick={() => nudgeMonth(1)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold disabled:opacity-45">Next</button>
              <label className="grid gap-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-harbor-navy/45">Checking Balance</span>
                <input
                  type="number"
                  value={checkingBalance}
                  onChange={(event) => setCheckingBalance(event.target.value)}
                  onBlur={() => void saveCheckingBalance()}
                  className="w-44 rounded-lg border border-slate-200 px-3 py-2 text-right text-sm font-semibold"
                />
              </label>
              <button type="button" onClick={() => void saveCheckingBalance()} className="rounded-lg bg-harbor-teal px-4 py-2 text-sm font-medium text-white">Save Balance</button>
            </div>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-4">
          <Summary label="Month Budget Planned" value={totals.planned} />
          <Summary label="Month Budget Remaining" value={totals.remaining} tone={totals.remaining >= 0 ? "green" : "red"} />
          <Summary label="Projected Checking Cash" value={totals.projectedChecking} tone={totals.projectedChecking >= 0 ? "green" : "red"} />
          <Summary label="Credit Card Liability" value={totals.cardLiability} tone={totals.cardLiability > 0 ? "red" : "green"} />
        </section>

        <section className="rounded-xl border border-harbor-teal-light bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
            <div className="inline-flex w-fit rounded-lg border border-slate-200 bg-slate-50 p-1">
              <button type="button" onClick={() => setViewMode("budget")} className={`rounded-md px-3 py-1.5 text-sm font-semibold ${viewMode === "budget" ? "bg-white text-harbor-teal shadow-sm" : "text-harbor-navy/55"}`}>Budget View</button>
              <button type="button" onClick={() => setViewMode("cash")} className={`rounded-md px-3 py-1.5 text-sm font-semibold ${viewMode === "cash" ? "bg-white text-harbor-teal shadow-sm" : "text-harbor-navy/55"}`}>True Cash View</button>
            </div>
            <div className="grid gap-2 md:grid-cols-[minmax(180px,1fr)_90px_minmax(150px,1fr)_140px_auto]">
              <select className="rounded-lg border border-slate-200 px-3 py-2 text-sm" value={cardSpendDraft.itemId || (cardSpendRows[0]?.id ?? "")} onChange={(event) => setCardSpendDraft((draft) => ({ ...draft, itemId: event.target.value }))}>
                {cardSpendRows.length === 0 ? <option value="">No card spending rows</option> : cardSpendRows.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
              <select className="rounded-lg border border-slate-200 px-3 py-2 text-sm" value={cardSpendDraft.weekIndex} onChange={(event) => setCardSpendDraft((draft) => ({ ...draft, weekIndex: Number(event.target.value) }))}>
                {weeks.map((week, index) => <option key={index} value={index}>Week {index + 1}</option>)}
              </select>
              <select className="rounded-lg border border-slate-200 px-3 py-2 text-sm" value={cardSpendDraft.cardId || cardSpendRows[0]?.paymentMethod || settings.creditCards[0]?.id || ""} onChange={(event) => setCardSpendDraft((draft) => ({ ...draft, cardId: event.target.value }))}>
                {settings.creditCards.map((card) => <option key={card.id} value={card.id}>{card.label}</option>)}
              </select>
              <input className="rounded-lg border border-slate-200 px-3 py-2 text-sm" type="number" min="0" step="0.01" placeholder="Amount" value={cardSpendDraft.amount} onChange={(event) => setCardSpendDraft((draft) => ({ ...draft, amount: event.target.value }))} />
              <button type="button" onClick={() => void logCardSpend()} className="rounded-lg bg-harbor-red px-4 py-2 text-sm font-medium text-white">Log Card Spend</button>
            </div>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-[minmax(160px,1fr)_120px_150px_minmax(160px,1fr)_auto]">
            <select className="rounded-lg border border-slate-200 px-3 py-2 text-sm" value={paymentDraft.cardId || settings.creditCards[0]?.id || ""} onChange={(event) => setPaymentDraft((draft) => ({ ...draft, cardId: event.target.value }))}>
              {settings.creditCards.map((card) => <option key={card.id} value={card.id}>{card.label}</option>)}
            </select>
            <input className="rounded-lg border border-slate-200 px-3 py-2 text-sm" type="number" min="0" step="0.01" placeholder="Payment" value={paymentDraft.amount} onChange={(event) => setPaymentDraft((draft) => ({ ...draft, amount: event.target.value }))} />
            <input className="rounded-lg border border-slate-200 px-3 py-2 text-sm" type="date" value={paymentDraft.date} onChange={(event) => setPaymentDraft((draft) => ({ ...draft, date: event.target.value }))} />
            <input className="rounded-lg border border-slate-200 px-3 py-2 text-sm" type="text" placeholder="Optional note" value={paymentDraft.note} onChange={(event) => setPaymentDraft((draft) => ({ ...draft, note: event.target.value }))} />
            <button type="button" onClick={() => void scheduleCardPayment()} className="rounded-lg bg-harbor-navy px-4 py-2 text-sm font-medium text-white">Schedule Card Payment</button>
          </div>
        </section>

        <section className="overflow-x-auto rounded-xl border border-harbor-teal-light bg-white shadow-sm">
          {monthLoading && (
            <div className="border-b border-harbor-teal-light bg-white px-4 py-3 text-sm font-medium text-harbor-navy/60">
              Loading {monthName}...
            </div>
          )}
          <table className="w-full min-w-[1120px] border-collapse text-sm">
            <thead>
              <tr className="bg-harbor-navy text-white">
                <th className="sticky left-0 z-10 bg-harbor-navy px-3 py-3 text-left">Row</th>
                <th className="px-3 py-3 text-left">Method</th>
                {weeks.map((week, index) => (
                  <th key={index} className="px-3 py-3 text-center">
                    <div>Week {index + 1}</div>
                    <div className="text-xs font-normal opacity-70">{week.label}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {incomeRows.length > 0 && <SectionRow label={GROUP_LABELS.income} collapsed={Boolean(collapsedGroups.income)} onToggle={() => toggleGroup("income")} colSpan={2 + weeks.length} />}
              {!monthLoading && !collapsedGroups.income && incomeRows.map((item) => (
                <tr key={item.id} className="border-b border-slate-100">
                  <RowHeader name={item.name} category="Income" />
                  <td className="px-3 py-3 text-harbor-green">Checking</td>
                  {weeks.map((week, weekIndex) => {
                    const applies = lineItemAppliesToWeek(item, weekIndex, week.start, week.end, month) || hasWeekAmount(amounts, item, weekIndex);
                    const amount = amountForWeek(amounts, item, weekIndex);
                    const state = dockStatesByItemWeek.get(stateKey(item.id, weekIndex));
                    const cleared = state?.status === "cleared";
                    const skipped = state?.status === "skipped";
                    return (
                      <td key={weekIndex} className={`px-3 py-3 text-center align-top ${cleared ? "bg-harbor-green/5" : skipped ? "bg-slate-50" : ""}`}>
                        {applies ? (
                          <div className="space-y-1">
                            <MoneyInput value={amount} tone="green" onChange={(value) => updatePlannedAmount(item.id, weekIndex, value)} onBlur={saveMonthlyAmounts} />
                            <div className="text-[11px] text-harbor-navy/50">{cleared ? "Received; excluded from future projection" : skipped ? "Skipped" : "Expected income"}</div>
                            {cleared ? <StatusPill label="Received" /> : skipped ? <StatusPill label="Skipped" tone="slate" /> : (
                              <div className="flex justify-center gap-2">
                                <button type="button" onClick={() => void markIncomeReceived(item, weekIndex)} className="text-[11px] font-semibold text-harbor-green">Mark received</button>
                                <button type="button" onClick={() => void skipDockItem(item, weekIndex)} className="text-[11px] font-semibold text-slate-500">Skip</button>
                              </div>
                            )}
                          </div>
                        ) : <span className="text-slate-300">-</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}

              {(["standardBills", "food", "pets", "other"] as const).map((group) => (
                <GroupRows
                  key={group}
                  group={group}
                  rows={budgetRowsByGroup[group]}
                  settings={settings}
                  weeks={weeks}
                  month={month}
                  amounts={amounts}
                  viewMode={viewMode}
                  collapsed={Boolean(collapsedGroups[group])}
                  monthLoading={monthLoading}
                  dockStatesByItemWeek={dockStatesByItemWeek}
                  spendLogsByItemWeek={spendLogsByItemWeek}
                  updatePlannedAmount={updatePlannedAmount}
                  saveMonthlyAmounts={saveMonthlyAmounts}
                  markCheckingBillPaid={markCheckingBillPaid}
                  skipDockItem={skipDockItem}
                  toggleGroup={() => toggleGroup(group)}
                />
              ))}

              {scheduledCardPayments.length > 0 && <SectionRow label={GROUP_LABELS.cardPayments} collapsed={Boolean(collapsedGroups.cardPayments)} onToggle={() => toggleGroup("cardPayments")} colSpan={2 + weeks.length} />}
              {!monthLoading && !collapsedGroups.cardPayments && scheduledCardPayments.map((payment) => (
                <tr key={payment.id} className="border-b border-slate-100">
                  <RowHeader name={payment.name} category={payment.date} />
                  <td className="px-3 py-3 text-harbor-navy/65">Checking</td>
                  {weeks.map((_, weekIndex) => (
                    <Cell key={weekIndex} value={payment.weekIndex === weekIndex ? formatMoney(payment.amount) : "-"} note={payment.weekIndex === weekIndex ? payment.status === "cleared" ? "Paid" : "Scheduled payment" : ""} tone="red" />
                  ))}
                </tr>
              ))}

              <SectionRow label="Weekly True Cash Summary" colSpan={2 + weeks.length} />
              <SummaryRow label="Starting Checking Cash" values={weeklyCash.map((week) => week.starting)} />
              <SummaryRow label="Inflows" values={weeklyCash.map((week) => week.inflows)} tone="green" />
              <SummaryRow label="Checking/Cash Outflows" values={weeklyCash.map((week) => week.checkingOutflows)} tone="red" />
              <SummaryRow label="Scheduled Card Payments" values={weeklyCash.map((week) => week.cardPayments)} tone="red" />
              <SummaryRow label="Projected Checking Cash" values={weeklyCash.map((week) => week.ending)} sticky tone="green" />
            </tbody>
          </table>
        </section>
      </div>
    </main>
  );
}

function Summary({ label, value, tone = "navy" }: { label: string; value: number; tone?: "navy" | "green" | "red" }) {
  const toneClass = tone === "green" ? "text-harbor-green" : tone === "red" ? "text-harbor-red" : "text-harbor-navy";
  return (
    <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-harbor-navy/45">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${toneClass}`}>{formatMoney(value)}</p>
    </div>
  );
}

function GroupRows({
  group,
  rows,
  settings,
  weeks,
  month,
  amounts,
  viewMode,
  collapsed,
  monthLoading,
  dockStatesByItemWeek,
  spendLogsByItemWeek,
  updatePlannedAmount,
  saveMonthlyAmounts,
  markCheckingBillPaid,
  skipDockItem,
  toggleGroup,
}: {
  group: Exclude<DockGroup, "income" | "cardPayments">;
  rows: LineItem[];
  settings: AppSettings;
  weeks: { start: Date; end: Date; label: string }[];
  month: number;
  amounts: Record<string, Record<number, number>>;
  viewMode: ViewMode;
  collapsed: boolean;
  monthLoading: boolean;
  dockStatesByItemWeek: Map<string, DockItemState>;
  spendLogsByItemWeek: Map<string, SpendLogEntry[]>;
  updatePlannedAmount: (itemId: string, weekIndex: number, value: string) => void;
  saveMonthlyAmounts: () => void | Promise<void>;
  markCheckingBillPaid: (item: LineItem, weekIndex: number) => void | Promise<void>;
  skipDockItem: (item: LineItem, weekIndex: number) => void | Promise<void>;
  toggleGroup: () => void;
}) {
  if (rows.length === 0) return null;

  return (
    <>
      <SectionRow label={GROUP_LABELS[group]} collapsed={collapsed} onToggle={toggleGroup} colSpan={2 + weeks.length} />
      {!monthLoading && !collapsed && rows.map((item) => (
        <tr key={item.id} className="border-b border-slate-100">
          <RowHeader name={item.name} category={item.category} />
          <td className="px-3 py-3 text-harbor-navy/65">{methodLabel(item.paymentMethod, settings)}</td>
          {weeks.map((week, weekIndex) => {
            const applies = lineItemAppliesToWeek(item, weekIndex, week.start, week.end, month) || hasWeekAmount(amounts, item, weekIndex);
            const planned = amountForWeek(amounts, item, weekIndex);
            const actual = (spendLogsByItemWeek.get(stateKey(item.id, weekIndex)) ?? []).reduce((sum, entry) => sum + entry.amount, 0);
            const remaining = Math.max(0, planned - actual);
            const state = dockStatesByItemWeek.get(stateKey(item.id, weekIndex));
            const paid = state?.status === "cleared";
            const skipped = state?.status === "skipped";
            const cashValue = skipped || isCardMethod(item.paymentMethod) ? 0 : Number(state?.actualAmount ?? (actual || planned));
            return (
              <td key={weekIndex} className={`px-3 py-3 text-center align-top ${paid ? "bg-harbor-green/5" : skipped ? "bg-slate-50" : ""}`}>
                {applies ? (
                  <div className="space-y-1">
                    {viewMode === "budget" ? (
                      <>
                        <MoneyInput value={planned} onChange={(value) => updatePlannedAmount(item.id, weekIndex, value)} onBlur={saveMonthlyAmounts} />
                        <div className="text-[11px] text-harbor-navy/50">Actual {formatMoney(actual)} / Left {formatMoney(remaining)}</div>
                      </>
                    ) : (
                      <>
                        <div className={`font-bold ${cashValue > 0 ? "text-harbor-red" : "text-slate-400"}`}>{cashValue > 0 ? formatMoney(cashValue) : "-"}</div>
                        <div className="text-[11px] text-harbor-navy/50">{isCardMethod(item.paymentMethod) ? "Card spend only" : paid ? "Paid" : skipped ? "Skipped" : "Checking cash outflow"}</div>
                      </>
                    )}
                    {!isCardMethod(item.paymentMethod) && planned > 0 && (
                      paid ? <StatusPill label="Paid" /> : skipped ? <StatusPill label="Skipped" tone="slate" /> : (
                        <div className="flex justify-center gap-2">
                          <button type="button" onClick={() => void markCheckingBillPaid(item, weekIndex)} className="text-[11px] font-semibold text-harbor-green">Mark paid</button>
                          <button type="button" onClick={() => void skipDockItem(item, weekIndex)} className="text-[11px] font-semibold text-slate-500">Skip</button>
                        </div>
                      )
                    )}
                  </div>
                ) : <span className="text-slate-300">-</span>}
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}

function SectionRow({ label, colSpan, collapsed, onToggle }: { label: string; colSpan: number; collapsed?: boolean; onToggle?: () => void }) {
  return (
    <tr className="bg-harbor-teal-light/70">
      <td colSpan={colSpan} className="px-3 py-2 text-xs font-bold uppercase tracking-wide text-harbor-navy/60">
        {onToggle ? (
          <button type="button" onClick={onToggle} className="flex w-full items-center justify-between text-left">
            <span>{label}</span>
            <span className="text-harbor-navy/45">{collapsed ? "Expand" : "Collapse"}</span>
          </button>
        ) : label}
      </td>
    </tr>
  );
}

function RowHeader({ name, category }: { name: string; category: string }) {
  return (
    <td className="sticky left-0 z-10 border-r border-slate-100 bg-white px-3 py-3">
      <div className="font-semibold text-harbor-navy">{name}</div>
      <div className="text-xs text-harbor-navy/45">{category}</div>
    </td>
  );
}

function MoneyInput({ value, onChange, onBlur, tone = "navy" }: { value: number; onChange: (value: string) => void; onBlur: () => void | Promise<void>; tone?: "navy" | "green" }) {
  return (
    <input
      type="number"
      min="0"
      step="0.01"
      value={value || ""}
      onChange={(event) => onChange(event.target.value)}
      onBlur={() => void onBlur()}
      className={`mx-auto w-24 rounded-md border border-slate-200 px-2 py-1 text-center text-sm font-bold ${tone === "green" ? "text-harbor-green" : "text-harbor-navy"}`}
    />
  );
}

function StatusPill({ label, tone = "green" }: { label: string; tone?: "green" | "slate" }) {
  const classes = tone === "green"
    ? "bg-harbor-green/10 text-harbor-green"
    : "bg-slate-100 text-slate-500";
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${classes}`}>{label}</span>;
}

function Cell({ value, note, tone = "navy" }: { value: string; note?: string; tone?: "navy" | "green" | "red" }) {
  const toneClass = tone === "green" ? "text-harbor-green" : tone === "red" ? "text-harbor-red" : "text-harbor-navy";
  return (
    <td className="px-3 py-3 text-center align-top">
      <div className={`font-bold ${value === "-" ? "text-slate-300" : toneClass}`}>{value}</div>
      {note && <div className="text-[11px] text-harbor-navy/50">{note}</div>}
    </td>
  );
}

function SummaryRow({ label, values, tone = "navy", sticky = false }: { label: string; values: number[]; tone?: "navy" | "green" | "red"; sticky?: boolean }) {
  const rowClass = sticky ? "bg-harbor-navy text-white" : "border-b border-slate-100 bg-white";
  const labelClass = sticky ? "sticky left-0 z-10 bg-harbor-navy px-3 py-3 font-bold" : "sticky left-0 z-10 border-r border-slate-100 bg-white px-3 py-3 font-semibold";
  const toneClass = tone === "green" ? "text-harbor-green" : tone === "red" ? "text-harbor-red" : sticky ? "text-white" : "text-harbor-navy";
  return (
    <tr className={rowClass}>
      <td className={labelClass} colSpan={2}>{label}</td>
      {values.map((value, index) => (
        <td key={index} className={`px-3 py-3 text-center font-bold ${toneClass}`}>{formatMoney(value)}</td>
      ))}
    </tr>
  );
}
