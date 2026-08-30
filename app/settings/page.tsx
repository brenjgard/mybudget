"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { EmptyState } from "../components/EmptyState";
import { loadSettingsWithSupabaseFallback, saveSettings } from "../lib/budget-settings";
import { budgetRepo } from "../lib/repositories/budget-repo";
import { localRepo } from "../lib/local-repo";
import { getRipplePlanType } from "../lib/ripple-type";
import { getDefaultRecurrence, recurrenceFromLegacyFrequency, recurrenceLabel } from "../lib/schedule";
import { cardCycleForDate, formatMoney, formatShortDate, getCalendarWeeksForMonth, monthKeyFor, weekIndexForDate } from "../lib/harbor-domain";
import { SEED_DATA } from "../data/seedData";
import type { AppSettings, CreditCardAccount, DayOfMonth, DockItemState, FrequencyType, LineItem, PaymentMethod, Recurrence, RecurrenceUnit, RipplePlanType, RippleType, SpendLogEntry } from "../lib/types";

const SHOW_DEV_TOOLS = process.env.NEXT_PUBLIC_SHOW_DEV_TOOLS === "true";
const DEFAULT_CHARTS = ["Home", "Food & Household", "Transportation", "Kids & Family", "Fun", "Subscriptions", "Savings", "Gifts", "Other"];
const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_DAY_OPTIONS: DayOfMonth[] = [...Array.from({ length: 31 }, (_, index) => index + 1), "last"];

type SettingsSection = "ripples" | "waves" | "fleet" | "charts";
type EditingItem = Omit<LineItem, "id"> & { id?: string };
type PaymentDraft = { amount: string; date: string };
type StatementDraft = {
  amount: string;
  dueDate: string;
  payments: PaymentDraft[];
};
type BalanceMessage = {
  tone: "higher" | "lower";
  amount: number;
  expected: number;
  actual: number;
};

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function todayISODate() {
  const today = new Date();
  return [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0"),
  ].join("-");
}

function currentMonthValue() {
  return todayISODate().slice(0, 7);
}

function monthKeysFrom(startDate: Date, monthCount: number) {
  return Array.from({ length: monthCount }, (_, index) => {
    const date = new Date(startDate.getFullYear(), startDate.getMonth() + index, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  });
}

function monthKeysBetween(startDate: Date, endDate: Date) {
  const keys: string[] = [];
  const current = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  const final = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
  while (current <= final) {
    keys.push(`${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}`);
    current.setMonth(current.getMonth() + 1);
  }
  return keys;
}

function monthDateFromValue(value: string) {
  return value ? `${value}-01` : undefined;
}

function monthValueFromDate(value?: string) {
  return value?.slice(0, 7) ?? currentMonthValue();
}

function dayOfMonthValue(day: DayOfMonth | undefined) {
  return day === undefined ? "1" : String(day);
}

function parseDayOfMonth(value: string): DayOfMonth {
  return value === "last" ? "last" : Number(value);
}

function frequencyForRecurrence(recurrence?: Recurrence): FrequencyType {
  switch (recurrence?.type) {
    case "biweekly":
      return "every-other-week";
    case "twiceMonthly":
      return "twice-a-month";
    case "monthly":
    case "quarterly":
    case "semiannual":
    case "annual":
      return "once-a-month-1";
    default:
      return "every-week";
  }
}

function clampDay(value: string, fallback: number) {
  return Math.min(31, Math.max(1, Number(value) || fallback));
}

function statementStateId(cardId: PaymentMethod, dueDate: string) {
  return `card-statement:${cardId}:${dueDate}`;
}

function paymentStateId(cardId: PaymentMethod, dueDate: string) {
  return `scheduled-card-payment:${cardId}:${dueDate}:${crypto.randomUUID()}`;
}

function cardStatementPrefix(cardId: PaymentMethod) {
  return `card-statement:${cardId}:`;
}

function scheduledStatementPaymentPrefix(cardId: PaymentMethod, dueDate: string) {
  return `scheduled-card-payment:${cardId}:${dueDate}:`;
}

function parseDate(value?: string) {
  if (!value) return null;
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function statePaymentDate(state: DockItemState) {
  return parseDate(state.pendingUntil) ?? parseDate(state.clearedAt);
}

function statementPayments(statement: DockItemState, dockStates: DockItemState[]) {
  const dueDate = statement.pendingUntil?.slice(0, 10) ?? "";
  const cardId = statement.itemId.split(":")[1] as PaymentMethod | undefined;
  if (!cardId || !dueDate) return [];
  return dockStates
    .filter((state) => (
      state.itemKind === "credit_card_payment"
      && state.itemId.startsWith(scheduledStatementPaymentPrefix(cardId, dueDate))
      && state.status !== "skipped"
    ))
    .sort((a, b) => (a.pendingUntil ?? "").localeCompare(b.pendingUntil ?? ""));
}

function upcomingStatementForCard(card: CreditCardAccount, dockStates: DockItemState[]) {
  const statement = dockStates
    .filter((state) => (
      state.itemKind === "credit_card_payment"
      && state.itemId.startsWith(cardStatementPrefix(card.id))
      && state.status !== "skipped"
    ))
    .sort((a, b) => (a.pendingUntil ?? "").localeCompare(b.pendingUntil ?? ""))[0];
  if (statement) return statement;

  return dockStates
    .filter((state) => (
      state.itemKind === "credit_card_payment"
      && state.itemId.startsWith(`opening-card-payment:${card.id}:`)
      && state.status !== "skipped"
    ))
    .sort((a, b) => (a.pendingUntil ?? "").localeCompare(b.pendingUntil ?? ""))[0];
}

function defaultRippleChart(charts: string[]) {
  return charts.find((chart) => chart.toLowerCase() !== "pay") ?? charts[0] ?? "Other";
}

function blankRipple(charts: string[], paymentMethod: PaymentMethod): EditingItem {
  return {
    category: defaultRippleChart(charts),
    name: "",
    defaultAmount: 0,
    paymentMethod,
    isIncome: false,
    frequency: "every-week",
    waveType: "recurring",
    recurrence: getDefaultRecurrence(),
    planType: "weekly_allowance",
    rippleType: "flexible",
  };
}

function blankWave(charts: string[]): EditingItem {
  return {
    category: charts[0] ?? "Pay",
    name: "",
    defaultAmount: 0,
    paymentMethod: "checking",
    isIncome: true,
    frequency: "every-week",
    waveType: "recurring",
    recurrence: getDefaultRecurrence(),
  };
}

function normalizeRipple(form: EditingItem): LineItem {
  const planType = form.planType ?? getRipplePlanType(form as LineItem);
  const base = {
    ...(form as LineItem),
    isIncome: false,
    planType,
    rippleType: planType === "scheduled_expense" ? "fixed" as RippleType : "flexible" as RippleType,
    includeInCashForecast: planType === "scheduled_expense" ? false : form.includeInCashForecast,
  };

  if (planType === "weekly_allowance") {
    const recurrence = form.recurrence ?? getDefaultRecurrence();
    return {
      ...base,
      waveType: "recurring",
      oneTimeDate: undefined,
      frequency: "every-week",
      recurrence,
      anchorDate: recurrence.startDate,
      anchorMonth: undefined,
    };
  }

  if (planType === "monthly_allowance") {
    const recurring = form.waveType !== "oneTime";
    const recurrence = form.recurrence?.type === "monthly"
      ? form.recurrence
      : { type: "monthly" as const, daysOfMonth: [1] };
    return {
      ...base,
      waveType: recurring ? "recurring" : "oneTime",
      oneTimeDate: recurring ? undefined : form.oneTimeDate ?? monthDateFromValue(currentMonthValue()),
      frequency: "once-a-month-1",
      recurrence: recurring ? recurrence : undefined,
      anchorDate: recurring ? recurrence.startDate : undefined,
      anchorMonth: undefined,
    };
  }

  const recurrence = form.waveType === "oneTime"
    ? undefined
    : form.recurrence ?? recurrenceFromLegacyFrequency({ ...(form as LineItem), id: form.id ?? "" });

  return {
    ...base,
    waveType: form.waveType ?? "recurring",
    oneTimeDate: form.waveType === "oneTime" ? form.oneTimeDate : undefined,
    recurrence,
    frequency: form.waveType === "oneTime" ? "once-a-month-1" : frequencyForRecurrence(recurrence),
    anchorDate: recurrence?.startDate,
  };
}

function normalizeWave(form: EditingItem): LineItem {
  const recurrence = form.waveType === "oneTime"
    ? undefined
    : form.recurrence ?? recurrenceFromLegacyFrequency({ ...(form as LineItem), id: form.id ?? "" });
  return {
    ...(form as LineItem),
    isIncome: true,
    paymentMethod: "checking",
    planType: undefined,
    rippleType: undefined,
    waveType: form.waveType ?? "recurring",
    oneTimeDate: form.waveType === "oneTime" ? form.oneTimeDate : undefined,
    recurrence,
    frequency: form.waveType === "oneTime" ? "once-a-month-1" : frequencyForRecurrence(recurrence),
    anchorDate: recurrence?.startDate,
  };
}

function planLabel(item: LineItem) {
  const planType = getRipplePlanType(item);
  if (planType === "weekly_allowance") return "Weekly Allowance";
  if (planType === "monthly_allowance") return "Monthly Allowance";
  return "Scheduled Expense";
}

function rippleImpact(item: LineItem, cardLabel?: string) {
  const planType = getRipplePlanType(item);
  if (planType !== "scheduled_expense") {
    return item.paymentMethod === "checking" ? "Budget; cash moves only when spending is logged" : `Budget + future ${cardLabel ?? "card"} payment`;
  }
  return item.paymentMethod === "checking" ? "Budget + Cash Flow" : `Budget + future ${cardLabel ?? "card"} payment`;
}

function rippleAmountLabel(item: LineItem) {
  return formatMoney(item.defaultAmount);
}

function rippleCadenceLabel(item: LineItem) {
  const planType = getRipplePlanType(item);
  if (planType === "weekly_allowance") return item.recurrence ? recurrenceLabel(item.recurrence) : "Weekly";
  if (planType === "monthly_allowance") return item.waveType === "oneTime" ? monthValueFromDate(item.oneTimeDate) : "Monthly";
  return item.waveType === "oneTime" ? item.oneTimeDate ?? "One time" : recurrenceLabel(item.recurrence ?? recurrenceFromLegacyFrequency(item));
}

function groupLineItemsByChart(items: LineItem[], charts: string[]) {
  const chartOrder = new Map(charts.map((chart, index) => [chart, index]));
  const grouped = items.reduce<Record<string, LineItem[]>>((result, item) => {
    const chart = item.category || "Other";
    return { ...result, [chart]: [...(result[chart] ?? []), item] };
  }, {});

  return Object.entries(grouped)
    .sort(([a], [b]) => (chartOrder.get(a) ?? 999) - (chartOrder.get(b) ?? 999) || a.localeCompare(b))
    .map(([chart, chartItems]) => ({ chart, items: chartItems }));
}

export default function Settings() {
  const router = useRouter();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [activeSection, setActiveSection] = useState<SettingsSection>("ripples");
  const [saved, setSaved] = useState(false);
  const [rippleSearch, setRippleSearch] = useState("");
  const [collapsedRippleCharts, setCollapsedRippleCharts] = useState<Record<string, boolean>>({});
  const [rippleForm, setRippleForm] = useState<EditingItem | null>(null);
  const [waveForm, setWaveForm] = useState<EditingItem | null>(null);
  const [cardBalanceDrafts, setCardBalanceDrafts] = useState<Record<string, string>>({});
  const [cardBalanceMessages, setCardBalanceMessages] = useState<Record<string, BalanceMessage | undefined>>({});
  const [fleetDockStates, setFleetDockStates] = useState<DockItemState[]>([]);
  const [fleetSpendLogs, setFleetSpendLogs] = useState<SpendLogEntry[]>([]);
  const [statementDrafts, setStatementDrafts] = useState<Record<string, StatementDraft>>({});
  const [activeStatementCardId, setActiveStatementCardId] = useState<PaymentMethod | null>(null);
  const [newChart, setNewChart] = useState("");
  const [newCard, setNewCard] = useState({
    label: "",
    closeDay: "21",
    dueDay: "15",
    hasOpeningStatement: false,
    openingAmount: "",
    openingDueDate: todayISODate(),
    openingPaymentDate: todayISODate(),
  });

  useEffect(() => {
    let cancelled = false;
    async function loadInitialData() {
      const loadedSettings = await loadSettingsWithSupabaseFallback();
      if (cancelled) return;
      if (!loadedSettings) {
        router.push("/setup");
        return;
      }
      setSettings(loadedSettings);
      setCardBalanceDrafts(Object.fromEntries(loadedSettings.creditCards.map((card) => [card.id, String(card.currentBalance ?? 0)])));
      const today = new Date();
      const monthKeys = monthKeysFrom(today, 4);
      void Promise.all([
        Promise.all(monthKeys.map((monthKey) => budgetRepo.getDockItemStates(monthKey))),
        Promise.all(monthKeys.map((monthKey) => budgetRepo.getSpendLogs(monthKey))),
      ]).then(([statesByMonth, spendByMonth]) => {
        if (cancelled) return;
        setFleetDockStates(statesByMonth.flat());
        setFleetSpendLogs(spendByMonth.flat());
      });
      const hash = window.location.hash.replace("#", "");
      if (["ripples", "waves", "fleet", "charts"].includes(hash)) setActiveSection(hash as SettingsSection);
    }
    void loadInitialData();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function persist(updated: AppSettings) {
    setSettings(updated);
    const savedSettings = await saveSettings(updated);
    setSettings(savedSettings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function loadDemoData() {
    if (!confirm("This will replace all current settings with demo data. Continue?")) return;
    localRepo.saveAmounts({});
    localRepo.saveMonthBalances({});
    await persist(SEED_DATA);
  }

  async function saveRipple(form: EditingItem) {
    if (!settings || !form.name.trim() || form.defaultAmount <= 0) return;
    const savedItem = normalizeRipple(form);
    const nextItems = form.id
      ? settings.lineItems.map((item) => item.id === form.id ? savedItem : item)
      : [...settings.lineItems, { ...savedItem, id: uid() }];
    await persist({ ...settings, lineItems: nextItems });
    setRippleForm(null);
  }

  async function saveWave(form: EditingItem) {
    if (!settings || !form.name.trim() || form.defaultAmount <= 0) return;
    if (form.waveType === "oneTime" && !form.oneTimeDate) return;
    const savedItem = normalizeWave(form);
    const nextItems = form.id
      ? settings.lineItems.map((item) => item.id === form.id ? savedItem : item)
      : [...settings.lineItems, { ...savedItem, id: uid() }];
    await persist({ ...settings, lineItems: nextItems });
    setWaveForm(null);
  }

  function deleteItem(id: string) {
    if (!settings || !confirm("Delete this item?")) return;
    void persist({ ...settings, lineItems: settings.lineItems.filter((item) => item.id !== id) });
  }

  function addChart() {
    const name = newChart.trim();
    if (!settings || !name || settings.categories.includes(name)) return;
    void persist({ ...settings, categories: [...settings.categories, name] });
    setNewChart("");
  }

  function removeChart(chart: string) {
    if (!settings) return;
    const hasItems = settings.lineItems.some((item) => item.category === chart);
    if (hasItems && !confirm(`"${chart}" contains Ripples or Waves. Delete the Chart and those definitions?`)) return;
    void persist({
      ...settings,
      categories: settings.categories.filter((item) => item !== chart),
      lineItems: settings.lineItems.filter((item) => item.category !== chart),
    });
  }

  function moveChart(chart: string, delta: number) {
    if (!settings) return;
    const index = settings.categories.indexOf(chart);
    const nextIndex = index + delta;
    if (index < 0 || nextIndex < 0 || nextIndex >= settings.categories.length) return;
    const next = [...settings.categories];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    void persist({ ...settings, categories: next });
  }

  async function addCard() {
    if (!settings || !newCard.label.trim()) return;
    const openingAmount = Number(newCard.openingAmount);
    const card = {
      id: `credit-${crypto.randomUUID()}` as PaymentMethod,
      label: newCard.label.trim(),
      currentBalance: 0,
      currentBalanceUpdatedAt: new Date().toISOString(),
      statementClosingDay: clampDay(newCard.closeDay, 21),
      paymentDueDay: clampDay(newCard.dueDay, 15),
    };
    await persist({ ...settings, creditCards: [...settings.creditCards, card] });
    if (newCard.hasOpeningStatement && Number.isFinite(openingAmount) && openingAmount > 0) {
      await saveStatementSchedule(card, {
        amount: newCard.openingAmount,
        dueDate: newCard.openingDueDate,
        payments: [{ amount: newCard.openingAmount, date: newCard.openingPaymentDate || newCard.openingDueDate }],
      });
    }
    setCardBalanceDrafts((current) => ({ ...current, [card.id]: "0" }));
    setNewCard({
      label: "",
      closeDay: "21",
      dueDay: "15",
      hasOpeningStatement: false,
      openingAmount: "",
      openingDueDate: todayISODate(),
      openingPaymentDate: todayISODate(),
    });
  }

  async function saveStatementSchedule(card: CreditCardAccount, draft: StatementDraft) {
    const amount = Number(draft.amount);
    const dueDate = draft.dueDate;
    const due = parseDate(dueDate);
    if (!Number.isFinite(amount) || amount <= 0 || !due) return;

    const existingStatementRows = fleetDockStates.filter((state) => (
      state.itemKind === "credit_card_payment"
      && state.itemId.startsWith(cardStatementPrefix(card.id))
    ));
    const existingStatementPayments = fleetDockStates.filter((state) => {
      if (state.itemKind !== "credit_card_payment") return false;
      if (state.itemId.startsWith(`opening-card-payment:${card.id}:`)) return true;
      if (!state.itemId.startsWith(`scheduled-card-payment:${card.id}:`)) return false;
      const existingDueDates = existingStatementRows
        .map((row) => row.pendingUntil?.slice(0, 10))
        .filter((date): date is string => Boolean(date));
      return (
        state.itemId.startsWith(scheduledStatementPaymentPrefix(card.id, dueDate))
        || existingDueDates.some((existingDueDate) => state.itemId.startsWith(scheduledStatementPaymentPrefix(card.id, existingDueDate)))
        || state.note === `${card.label} statement payment`
      );
    });
    await Promise.all([...existingStatementRows, ...existingStatementPayments].map((state) => (
      budgetRepo.deleteDockItemState(state.monthKey, state.itemId, state.itemKind, state.weekIndex)
    )));

    const sourceMonthKey = monthKeyFor(due.getFullYear(), due.getMonth());
    const sourceWeeks = getCalendarWeeksForMonth(due.getFullYear(), due.getMonth());
    const savedStatement = await budgetRepo.saveDockItemState({
      monthKey: sourceMonthKey,
      weekIndex: Math.max(0, weekIndexForDate(sourceWeeks, due)),
      itemId: statementStateId(card.id, dueDate),
      itemKind: "credit_card_payment",
      behaviorType: "credit_card_payment",
      status: "pending",
      plannedAmount: amount,
      actualAmount: amount,
      pendingUntil: dueDate,
      note: `${card.label} upcoming statement`,
    });

    const paymentRows = draft.payments.flatMap((payment) => {
      const paymentAmount = Number(payment.amount);
      const paymentDate = parseDate(payment.date);
      if (!Number.isFinite(paymentAmount) || paymentAmount <= 0 || !paymentDate) return [];
      const paymentMonthKey = monthKeyFor(paymentDate.getFullYear(), paymentDate.getMonth());
      const paymentWeeks = getCalendarWeeksForMonth(paymentDate.getFullYear(), paymentDate.getMonth());
      return [{
        monthKey: paymentMonthKey,
        weekIndex: Math.max(0, weekIndexForDate(paymentWeeks, paymentDate)),
        itemId: paymentStateId(card.id, dueDate),
        itemKind: "credit_card_payment",
        behaviorType: "credit_card_payment",
        status: "upcoming",
        plannedAmount: paymentAmount,
        actualAmount: paymentAmount,
        pendingUntil: payment.date,
        note: `${card.label} statement payment`,
      } satisfies DockItemState];
    });

    const savedPayments = await Promise.all(paymentRows.map((payment) => budgetRepo.saveDockItemState(payment)));
    setFleetDockStates((current) => {
      const removedIds = new Set([
        savedStatement.itemId,
        ...existingStatementRows.map((state) => state.itemId),
        ...existingStatementPayments.map((state) => state.itemId),
      ]);
      return [...current.filter((state) => !removedIds.has(state.itemId)), savedStatement, ...savedPayments];
    });
    setStatementDrafts((current) => {
      const next = { ...current };
      delete next[card.id];
      return next;
    });
    setActiveStatementCardId(null);
  }

  async function refreshFleetActivity() {
    const today = new Date();
    const monthKeys = monthKeysFrom(today, 4);
    const [statesByMonth, spendByMonth] = await Promise.all([
      Promise.all(monthKeys.map((monthKey) => budgetRepo.getDockItemStates(monthKey))),
      Promise.all(monthKeys.map((monthKey) => budgetRepo.getSpendLogs(monthKey))),
    ]);
    setFleetDockStates(statesByMonth.flat());
    setFleetSpendLogs(spendByMonth.flat());
  }

  function updateCard(id: PaymentMethod, updater: (card: CreditCardAccount) => CreditCardAccount) {
    if (!settings) return;
    void persist({ ...settings, creditCards: settings.creditCards.map((card) => card.id === id ? updater(card) : card) });
  }

  function removeCard(id: PaymentMethod) {
    if (!settings) return;
    const card = settings.creditCards.find((candidate) => candidate.id === id);
    if (!card) return;
    if (!confirm(`Remove ${card.label}? Ripples using it will switch to Checking.`)) return;
    void persist({
      ...settings,
      creditCards: settings.creditCards.filter((candidate) => candidate.id !== id),
      lineItems: settings.lineItems.map((item) => item.paymentMethod === id ? { ...item, paymentMethod: "checking" as PaymentMethod } : item),
    });
  }

  function expectedCardBalance(card: CreditCardAccount, spendLogs = fleetSpendLogs, dockStates = fleetDockStates) {
    const snapshotDate = parseDate(card.currentBalanceUpdatedAt) ?? new Date(0);
    const spending = spendLogs
      .filter((entry) => entry.paymentMethod === card.id)
      .filter((entry) => {
        const date = parseDate(entry.date);
        return date ? date > snapshotDate : false;
      })
      .reduce((sum, entry) => sum + entry.amount, 0);
    const payments = dockStates
      .filter((state) => state.itemKind === "credit_card_payment" && state.status === "cleared")
      .filter((state) => state.itemId.includes(`:${card.id}:`))
      .filter((state) => {
        const date = statePaymentDate(state);
        return date ? date > snapshotDate : false;
      })
      .reduce((sum, state) => sum + Number(state.actualAmount ?? state.plannedAmount ?? 0), 0);
    return Number(card.currentBalance ?? 0) + spending - payments;
  }

  async function loadCardActivitySince(card: CreditCardAccount) {
    const snapshotDate = parseDate(card.currentBalanceUpdatedAt) ?? new Date();
    const today = new Date();
    const monthKeys = monthKeysBetween(snapshotDate, today);
    const [spendByMonth, statesByMonth] = await Promise.all([
      Promise.all(monthKeys.map((monthKey) => budgetRepo.getSpendLogs(monthKey))),
      Promise.all(monthKeys.map((monthKey) => budgetRepo.getDockItemStates(monthKey))),
    ]);
    return { spendLogs: spendByMonth.flat(), dockStates: statesByMonth.flat() };
  }

  async function updateCardBalance(id: PaymentMethod) {
    if (!settings) return;
    const card = settings.creditCards.find((candidate) => candidate.id === id);
    if (!card) return;
    const value = cardBalanceDrafts[id] ?? "";
    const amount = value.trim() === "" ? 0 : Number(value);
    if (!Number.isFinite(amount) || amount < 0) return;
    const activity = await loadCardActivitySince(card);
    const expected = expectedCardBalance(card, activity.spendLogs, activity.dockStates);
    const difference = amount - expected;
    setCardBalanceMessages((current) => ({
      ...current,
      [id]: Math.abs(difference) >= 1 ? {
        tone: difference > 0 ? "higher" : "lower",
        amount: Math.abs(difference),
        expected,
        actual: amount,
      } : undefined,
    }));
    await persist({
      ...settings,
      creditCards: settings.creditCards.map((card) => card.id === id ? {
        ...card,
        currentBalance: amount,
        currentBalanceUpdatedAt: new Date().toISOString(),
      } : card),
    });
    void refreshFleetActivity();
  }

  if (!settings) {
    return (
      <main className="flex flex-1 items-center justify-center bg-harbor-offwhite">
        <p className="text-harbor-navy/50">Loading...</p>
      </main>
    );
  }

  const ripples = settings.lineItems.filter((item) => !item.isIncome);
  const waves = settings.lineItems.filter((item) => item.isIncome);
  const paymentOptions = [
    { value: "checking" as PaymentMethod, label: "Checking" },
    ...settings.creditCards.map((card) => ({ value: card.id, label: card.label })),
  ];
  const filteredRipples = (() => {
    const query = rippleSearch.trim().toLowerCase();
    if (!query) return ripples;
    return ripples.filter((item) => {
      const payment = paymentOptions.find((option) => option.value === item.paymentMethod)?.label ?? "";
      return [item.name, item.category, payment, planLabel(item)].some((value) => value.toLowerCase().includes(query));
    });
  })();
  const ripplesByChart = groupLineItemsByChart(filteredRipples, settings.categories);
  const unusedDefaults = DEFAULT_CHARTS.filter((chart) => !settings.categories.includes(chart));

  return (
    <main className="harbor-page flex-1 p-3 text-harbor-navy sm:p-4">
      <div className="mx-auto max-w-[1280px] space-y-4 sm:space-y-5">
        <section className="harbor-hero flex flex-col gap-4 rounded-xl px-4 py-4 sm:px-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-white/70">Settings</p>
            <h1 className="mt-1 text-2xl font-bold sm:text-3xl">Chart Room</h1>
            <p className="mt-1 text-sm text-white/70">Charts organize the plan. Ripples and Waves define what happens.</p>
          </div>
          <div className="flex items-center gap-2">
            {saved && <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white">Saved</span>}
            {SHOW_DEV_TOOLS && (
              <button type="button" onClick={() => void loadDemoData()} className="rounded-lg border border-dashed border-white/30 px-3 py-2 text-xs font-semibold text-white/75 hover:bg-white/10">Load Demo</button>
            )}
          </div>
        </section>

        <nav className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          {([
            ["ripples", "Ripples", ripples.length],
            ["waves", "Waves", waves.length],
            ["fleet", "Fleet", settings.creditCards.length],
            ["charts", "Charts", settings.categories.length],
          ] as const).map(([id, label, count]) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveSection(id)}
              className={`min-h-11 rounded-lg border px-4 py-2 text-sm font-semibold shadow-sm ${activeSection === id ? "border-harbor-teal bg-harbor-teal text-white" : "border-white bg-white/85 text-harbor-navy/65 hover:border-harbor-teal-light hover:text-harbor-navy"}`}
            >
              {label} <span className="ml-1 opacity-70">{count}</span>
            </button>
          ))}
        </nav>

        {activeSection === "ripples" && (
          <Section
            title="Ripples"
            subtitle="Spending plans: allowances and scheduled expenses."
            action={!rippleForm && <button type="button" onClick={() => setRippleForm(blankRipple(settings.categories, settings.creditCards[0]?.id ?? "checking"))} className="rounded-lg bg-harbor-red px-4 py-2 text-sm font-semibold text-white">Add Ripple</button>}
          >
            <div className="mb-4">
              <input
                className="field max-w-xl"
                placeholder="Search Ripples, Charts, or payment source"
                value={rippleSearch}
                onChange={(event) => setRippleSearch(event.target.value)}
              />
            </div>
            <div className="space-y-4">
              {ripples.length === 0 && !rippleForm && <EmptyState title="No Ripples yet">Add spending plans for allowances, bills, subscriptions, and one-time budgets.</EmptyState>}
              {ripples.length > 0 && filteredRipples.length === 0 && !rippleForm && <EmptyState title="No matching Ripples">Try another name, Chart, or payment source.</EmptyState>}
              {ripplesByChart.map(({ chart, items }) => {
                const collapsed = Boolean(collapsedRippleCharts[chart]);
                return (
                  <ChartDefinitionGroup
                    key={chart}
                    chart={chart}
                    count={items.length}
                    collapsed={collapsed}
                    onToggle={() => setCollapsedRippleCharts((current) => ({ ...current, [chart]: !collapsed }))}
                  >
                    {items.map((item) => {
                      const card = settings.creditCards.find((candidate) => candidate.id === item.paymentMethod);
                      return (
                        <DefinitionRow
                          key={item.id}
                          title={item.name}
                          badge={planLabel(item)}
                          amount={rippleAmountLabel(item)}
                          cadence={rippleCadenceLabel(item)}
                          source={card?.label ?? "Checking"}
                          impact={rippleImpact(item, card?.label)}
                          onEdit={() => setRippleForm({ ...item, planType: getRipplePlanType(item) })}
                          onDelete={() => deleteItem(item.id)}
                        />
                      );
                    })}
                  </ChartDefinitionGroup>
                );
              })}
            </div>
            {rippleForm && (
              <RippleForm
                item={rippleForm}
                charts={settings.categories}
                paymentOptions={paymentOptions}
                onSave={saveRipple}
                onCancel={() => setRippleForm(null)}
              />
            )}
          </Section>
        )}

        {activeSection === "waves" && (
          <Section
            title="Waves"
            subtitle="Income expected to arrive in checking."
            action={!waveForm && <button type="button" onClick={() => setWaveForm(blankWave(settings.categories))} className="rounded-lg bg-harbor-green px-4 py-2 text-sm font-semibold text-white">Add Wave</button>}
          >
            <div className="space-y-2">
              {waves.length === 0 && !waveForm && <EmptyState title="No Waves yet">Add recurring income or one-time deposits so Dock can forecast cash in.</EmptyState>}
              {waves.map((item) => (
                <DefinitionRow
                  key={item.id}
                  title={item.name}
                  badge={item.waveType === "oneTime" ? "One-Time Income" : "Recurring Income"}
                  amount={formatMoney(item.defaultAmount)}
                  cadence={item.waveType === "oneTime" ? item.oneTimeDate ?? "No date" : recurrenceLabel(item.recurrence ?? recurrenceFromLegacyFrequency(item))}
                  source="Checking"
                  impact="Dock cash-in"
                  onEdit={() => setWaveForm({ ...item })}
                  onDelete={() => deleteItem(item.id)}
                />
              ))}
            </div>
            {waveForm && (
              <WaveForm
                item={waveForm}
                onSave={saveWave}
                onCancel={() => setWaveForm(null)}
              />
            )}
          </Section>
        )}

        {activeSection === "fleet" && (
          <Section title="Fleet" subtitle="Credit cards that turn card spending into future checking obligations.">
            <div className="space-y-2">
              {settings.creditCards.length === 0 && <EmptyState title="No Fleet cards yet">Add cards used for spending so Harbor can route future payments.</EmptyState>}
              {settings.creditCards.map((card) => {
                const statement = upcomingStatementForCard(card, fleetDockStates);
                const payments = statement
                  ? statement.itemId.startsWith("opening-card-payment:")
                    ? [statement]
                    : statementPayments(statement, fleetDockStates)
                  : [];
                const statementDraft = statementDrafts[card.id] ?? {
                  amount: "",
                  dueDate: todayISODate(),
                  payments: [{ amount: "", date: todayISODate() }],
                };
                return (
                <div key={card.id} className="rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-white px-4 py-3 shadow-sm">
                  <div className="flex flex-col gap-4">
                    <div>
                      <div className="font-bold">{card.label}</div>
                      <div className="text-xs text-harbor-navy/50">Closes day {card.statementClosingDay ?? 31} · Due day {card.paymentDueDay ?? 15} · Paid from Checking</div>
                    </div>
                    <FleetBalanceSummary card={card} />
                    {cardBalanceMessages[card.id] && <BalanceWarning message={cardBalanceMessages[card.id]} />}
                    <UpcomingStatementPanel
                      card={card}
                      statement={statement}
                      payments={payments}
                      draft={statementDraft}
                      isEditing={activeStatementCardId === card.id}
                      onStart={() => setActiveStatementCardId(card.id)}
                      onCancel={() => setActiveStatementCardId(null)}
                      onDraftChange={(draft) => setStatementDrafts((current) => ({ ...current, [card.id]: draft }))}
                      onSave={() => void saveStatementSchedule(card, statementDraft)}
                    />
                    <div className="flex flex-wrap items-end gap-2 rounded-lg border border-indigo-100 bg-white/70 p-3">
                      <label className="grid gap-1">
                        <span className="text-xs text-harbor-navy/45">Current Balance</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={cardBalanceDrafts[card.id] ?? String(card.currentBalance ?? 0)}
                          onChange={(event) => setCardBalanceDrafts((current) => ({ ...current, [card.id]: event.target.value }))}
                          className="w-36 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                        />
                      </label>
                      <button type="button" onClick={() => void updateCardBalance(card.id)} className="rounded-lg bg-harbor-teal px-3 py-2 text-xs font-semibold text-white">Update Balance</button>
                      <label className="grid gap-1">
                        <span className="text-xs text-harbor-navy/45">Close Day</span>
                        <input type="number" min="1" max="31" value={card.statementClosingDay ?? 31} onChange={(event) => updateCard(card.id, (current) => ({ ...current, statementClosingDay: clampDay(event.target.value, 31) }))} className="w-24 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
                      </label>
                      <label className="grid gap-1">
                        <span className="text-xs text-harbor-navy/45">Due Day</span>
                        <input type="number" min="1" max="31" value={card.paymentDueDay ?? 15} onChange={(event) => updateCard(card.id, (current) => ({ ...current, paymentDueDay: clampDay(event.target.value, 15) }))} className="w-24 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
                      </label>
                      <button type="button" onClick={() => removeCard(card.id)} className="rounded-lg border border-harbor-red/20 px-3 py-2 text-xs font-semibold text-harbor-red">Remove</button>
                    </div>
                  </div>
                </div>
                );
              })}
            </div>
            <div className="mt-4 rounded-xl border border-teal-200 bg-teal-50 p-3 shadow-sm">
              <div className="grid gap-2 md:grid-cols-[1fr_120px_120px_auto]">
                <input className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" placeholder="Card name" value={newCard.label} onChange={(event) => setNewCard((current) => ({ ...current, label: event.target.value }))} />
                <input className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" type="number" min="1" max="31" aria-label="Statement close day" value={newCard.closeDay} onChange={(event) => setNewCard((current) => ({ ...current, closeDay: event.target.value }))} />
                <input className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" type="number" min="1" max="31" aria-label="Due day" value={newCard.dueDay} onChange={(event) => setNewCard((current) => ({ ...current, dueDay: event.target.value }))} />
                <button type="button" onClick={() => void addCard()} className="rounded-lg bg-harbor-navy px-4 py-2 text-sm font-semibold text-white">Add Card</button>
              </div>
              <label className="mt-3 flex items-center gap-2 text-sm font-semibold text-harbor-navy/65">
                <input type="checkbox" checked={newCard.hasOpeningStatement} onChange={(event) => setNewCard((current) => ({ ...current, hasOpeningStatement: event.target.checked }))} />
                Existing statement still needs to be paid
              </label>
              {newCard.hasOpeningStatement && (
                <div className="mt-3 grid gap-2 md:grid-cols-3">
                  <Field label="Statement Amount"><input className="field" type="number" min="0" step="0.01" value={newCard.openingAmount} onChange={(event) => setNewCard((current) => ({ ...current, openingAmount: event.target.value }))} /></Field>
                  <Field label="Due Date"><input className="field" type="date" value={newCard.openingDueDate} onChange={(event) => setNewCard((current) => ({ ...current, openingDueDate: event.target.value, openingPaymentDate: current.openingPaymentDate || event.target.value }))} /></Field>
                  <Field label="Planned Payment"><input className="field" type="date" value={newCard.openingPaymentDate} onChange={(event) => setNewCard((current) => ({ ...current, openingPaymentDate: event.target.value }))} /></Field>
                </div>
              )}
            </div>
          </Section>
        )}

        {activeSection === "charts" && (
          <Section title="Charts" subtitle="Budget organization. Charts do not control cash timing.">
            <div className="space-y-2">
              {settings.categories.map((chart, index) => (
                <div key={chart} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-cyan-100 bg-gradient-to-br from-cyan-50 to-white px-4 py-3 shadow-sm">
                  <div>
                    <div className="font-bold">{chart}</div>
                    <div className="text-xs text-harbor-navy/50">{settings.lineItems.filter((item) => item.category === chart).length} definitions</div>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => moveChart(chart, -1)} disabled={index === 0} className="rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-harbor-navy/55 disabled:opacity-35">Up</button>
                    <button type="button" onClick={() => moveChart(chart, 1)} disabled={index === settings.categories.length - 1} className="rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-harbor-navy/55 disabled:opacity-35">Down</button>
                    <button type="button" onClick={() => removeChart(chart)} className="rounded-md border border-harbor-red/20 px-2 py-1 text-xs font-semibold text-harbor-red">Remove</button>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex gap-2">
              <input className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" placeholder="New Chart name" value={newChart} onChange={(event) => setNewChart(event.target.value)} onKeyDown={(event) => event.key === "Enter" && addChart()} />
              <button type="button" onClick={addChart} className="rounded-lg bg-harbor-teal px-4 py-2 text-sm font-semibold text-white">Add Chart</button>
            </div>
            {unusedDefaults.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {unusedDefaults.map((chart) => (
                  <button key={chart} type="button" onClick={() => void persist({ ...settings, categories: [...settings.categories, chart] })} className="rounded-full border border-dashed border-slate-300 px-3 py-1.5 text-xs font-semibold text-harbor-navy/55 hover:border-harbor-teal hover:text-harbor-teal">+ {chart}</button>
                ))}
              </div>
            )}
          </Section>
        )}
      </div>
    </main>
  );
}

function Section({ title, subtitle, action, children }: { title: string; subtitle: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="harbor-shell rounded-xl p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">{title}</h2>
          <p className="mt-1 text-sm text-harbor-navy/55">{subtitle}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function ChartDefinitionGroup({ chart, count, collapsed, onToggle, children }: { chart: string; count: number; collapsed: boolean; onToggle: () => void; children: React.ReactNode }) {
  const accent = settingsAccent(chart);
  return (
    <section className={`overflow-hidden rounded-xl border bg-white shadow-sm ${accent.border}`}>
      <button type="button" onClick={onToggle} className={`flex min-h-12 w-full items-center justify-between gap-3 border-b px-4 py-3 text-left ${accent.header}`}>
        <div className="min-w-0">
          <h3 className="truncate text-sm font-bold uppercase tracking-wide text-harbor-navy">{chart}</h3>
          <p className="text-xs text-harbor-navy/45">{count} {count === 1 ? "Ripple" : "Ripples"}</p>
        </div>
        <span className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-harbor-navy/60">{collapsed ? "Expand" : "Collapse"}</span>
      </button>
      {!collapsed && <div className="divide-y divide-slate-100 px-4">{children}</div>}
    </section>
  );
}

function DefinitionRow({ title, badge, amount, cadence, source, impact, onEdit, onDelete }: { title: string; badge: string; amount: string; cadence: string; source: string; impact: string; onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="group flex min-h-12 flex-col gap-2 py-3 sm:grid sm:grid-cols-[minmax(0,1.25fr)_minmax(130px,0.6fr)_minmax(120px,0.55fr)_auto] sm:items-center sm:gap-3">
      <button type="button" onClick={onEdit} className="min-w-0 text-left">
        <div className="truncate font-semibold text-harbor-navy">{title}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-harbor-navy/50">
          <span>{badge}</span>
          <span className="hidden sm:inline">{impact}</span>
        </div>
      </button>
      <button type="button" onClick={onEdit} className="text-left sm:text-right">
        <div className="font-semibold tabular-nums text-harbor-navy">{amount}</div>
        <div className="text-xs text-harbor-navy/50">{cadence}</div>
      </button>
      <button type="button" onClick={onEdit} className="text-left text-sm font-medium text-harbor-navy/65 sm:text-right">{source}</button>
      <div className="flex items-center gap-2 sm:justify-end">
        <button type="button" onClick={onEdit} className="rounded-md border border-harbor-teal-light bg-white px-3 py-2 text-xs font-semibold text-harbor-teal sm:hidden">Edit</button>
        <button type="button" onClick={onDelete} className="rounded-md px-3 py-2 text-xs font-semibold text-harbor-red/70 hover:bg-red-50 hover:text-harbor-red">Delete</button>
      </div>
    </div>
  );
}

function settingsAccent(chart: string) {
  const accents = [
    { border: "border-cyan-200", header: "border-cyan-100 bg-cyan-50" },
    { border: "border-emerald-200", header: "border-emerald-100 bg-emerald-50" },
    { border: "border-rose-200", header: "border-rose-100 bg-rose-50" },
    { border: "border-amber-200", header: "border-amber-100 bg-amber-50" },
    { border: "border-indigo-200", header: "border-indigo-100 bg-indigo-50" },
  ];
  const index = [...chart].reduce((sum, char) => sum + char.charCodeAt(0), 0) % accents.length;
  return accents[index];
}

function FleetBalanceSummary({ card }: { card: CreditCardAccount }) {
  const updatedAt = card.currentBalanceUpdatedAt ? new Date(card.currentBalanceUpdatedAt) : null;
  const anchorDate = updatedAt && !Number.isNaN(updatedAt.getTime()) ? updatedAt : new Date();
  const cycle = cardCycleForDate(card, anchorDate);

  return (
    <div className="grid gap-3 rounded-lg border border-white bg-white/70 p-3 md:grid-cols-2">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-harbor-navy/45">Current Balance</div>
        <div className="mt-1 text-xl font-bold text-harbor-navy">{formatMoney(card.currentBalance ?? 0)}</div>
        <div className="text-xs text-harbor-navy/50">{updatedAt ? `Updated ${formatShortDate(updatedAt)}` : "Not updated yet"}</div>
      </div>
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-harbor-navy/45">Current Cycle</div>
        <div className="mt-1 text-sm font-bold text-harbor-navy">{formatShortDate(cycle.cycleStart)} - {formatShortDate(cycle.cycleEnd)}</div>
        <div className="text-xs text-harbor-navy/50">Projected due {formatShortDate(cycle.dueDate)}</div>
      </div>
    </div>
  );
}

function BalanceWarning({ message }: { message?: BalanceMessage }) {
  if (!message) return null;
  const higher = message.tone === "higher";
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-harbor-navy">
      <div className="font-bold">
        {higher
          ? `${formatMoney(message.amount)} may not be accounted for yet`
          : `Your balance is ${formatMoney(message.amount)} lower than expected`}
      </div>
      <p className="mt-1 text-xs text-harbor-navy/60">
        {higher
          ? `Your card balance is higher than Harbor expected based on spending you've logged.`
          : `A payment, credit, or adjustment may not be recorded.`}
      </p>
      <p className="mt-1 text-xs text-harbor-navy/45">Expected {formatMoney(message.expected)} | Reported {formatMoney(message.actual)}</p>
    </div>
  );
}

function UpcomingStatementPanel({
  card,
  statement,
  payments,
  draft,
  isEditing,
  onStart,
  onCancel,
  onDraftChange,
  onSave,
}: {
  card: CreditCardAccount;
  statement?: DockItemState;
  payments: DockItemState[];
  draft: StatementDraft;
  isEditing: boolean;
  onStart: () => void;
  onCancel: () => void;
  onDraftChange: (draft: StatementDraft) => void;
  onSave: () => void;
}) {
  const statementAmount = Number(statement?.plannedAmount ?? statement?.actualAmount ?? 0);
  const scheduled = payments.reduce((sum, payment) => sum + Number(payment.actualAmount ?? payment.plannedAmount ?? 0), 0);
  const remaining = Math.max(0, statementAmount - scheduled);

  function updatePayment(index: number, patch: Partial<PaymentDraft>) {
    onDraftChange({
      ...draft,
      payments: draft.payments.map((payment, paymentIndex) => paymentIndex === index ? { ...payment, ...patch } : payment),
    });
  }

  function startEditing() {
    if (statement) {
      onDraftChange({
        amount: String(statementAmount || ""),
        dueDate: statement.pendingUntil?.slice(0, 10) ?? todayISODate(),
        payments: payments.length > 0
          ? payments.map((payment) => ({
            amount: String(payment.actualAmount ?? payment.plannedAmount ?? ""),
            date: payment.pendingUntil?.slice(0, 10) ?? todayISODate(),
          }))
          : [{ amount: String(statementAmount || ""), date: statement.pendingUntil?.slice(0, 10) ?? todayISODate() }],
      });
    }
    onStart();
  }

  return (
    <div className="rounded-lg border border-white bg-white/70 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-harbor-navy/45">Upcoming Statement</div>
          {statement ? (
            <>
              <div className="mt-1 text-xl font-bold text-harbor-navy">{formatMoney(statementAmount)}</div>
              <div className="text-xs text-harbor-navy/50">Due {statement.pendingUntil ? formatShortDate(new Date(`${statement.pendingUntil.slice(0, 10)}T00:00:00`)) : "not set"}</div>
            </>
          ) : (
            <div className="mt-1 text-sm text-harbor-navy/50">No upcoming statement saved for {card.label}.</div>
          )}
        </div>
        <button type="button" onClick={startEditing} className="rounded-lg bg-harbor-teal/10 px-3 py-2 text-xs font-semibold text-harbor-teal">
          {statement ? "Edit Statement" : "+ Add Upcoming Statement"}
        </button>
      </div>

      {statement && (
        <div className="mt-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-harbor-navy/45">Payment Schedule</div>
          {payments.length > 0 ? (
            <div className="mt-2 space-y-1">
              {payments.map((payment) => {
                const date = payment.pendingUntil ? new Date(`${payment.pendingUntil.slice(0, 10)}T00:00:00`) : null;
                return (
                  <div key={payment.itemId} className="flex justify-between gap-3 text-sm">
                    <span className="text-harbor-navy/60">{date ? formatShortDate(date) : "Unscheduled"}</span>
                    <span className="font-bold">{formatMoney(Number(payment.actualAmount ?? payment.plannedAmount ?? 0))}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="mt-2 text-sm text-harbor-navy/45">No payments scheduled yet.</p>
          )}
          <p className="mt-2 text-xs font-semibold text-harbor-navy/55">Scheduled {formatMoney(scheduled)} | Remaining {formatMoney(remaining)}</p>
        </div>
      )}

      {isEditing && (
        <div className="mt-3 rounded-lg border border-harbor-teal-light bg-harbor-offwhite p-3">
          <div className="grid gap-2 md:grid-cols-2">
            <Field label="Statement Balance"><input className="field" type="number" min="0" step="0.01" value={draft.amount} onChange={(event) => onDraftChange({ ...draft, amount: event.target.value })} /></Field>
            <Field label="Due Date"><input className="field" type="date" value={draft.dueDate} onChange={(event) => onDraftChange({ ...draft, dueDate: event.target.value })} /></Field>
          </div>
          <div className="mt-3 space-y-2">
            {draft.payments.map((payment, index) => (
              <div key={index} className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
                <Field label={`Payment ${index + 1}`}><input className="field" type="number" min="0" step="0.01" value={payment.amount} onChange={(event) => updatePayment(index, { amount: event.target.value })} /></Field>
                <Field label="Date"><input className="field" type="date" value={payment.date} onChange={(event) => updatePayment(index, { date: event.target.value })} /></Field>
                <button type="button" onClick={() => onDraftChange({ ...draft, payments: draft.payments.filter((_, paymentIndex) => paymentIndex !== index) })} className="self-end rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-harbor-navy/55">Remove</button>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <button type="button" onClick={() => onDraftChange({ ...draft, payments: [...draft.payments, { amount: "", date: draft.dueDate || todayISODate() }] })} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-harbor-teal">Add Payment</button>
            <div className="flex gap-2">
              <button type="button" onClick={onSave} className="rounded-lg bg-harbor-teal px-4 py-2 text-sm font-semibold text-white">Save Statement</button>
              <button type="button" onClick={onCancel} className="rounded-lg px-3 py-2 text-sm font-semibold text-harbor-navy/45">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RippleForm({ item, charts, paymentOptions, onSave, onCancel }: { item: EditingItem; charts: string[]; paymentOptions: { value: PaymentMethod; label: string }[]; onSave: (item: EditingItem) => void | Promise<void>; onCancel: () => void }) {
  const [form, setForm] = useState<EditingItem>({ ...item, planType: item.planType ?? getRipplePlanType(item as LineItem) });
  const planType = form.planType ?? "weekly_allowance";
  const recurrence = form.recurrence ?? getDefaultRecurrence();

  function setPlanType(nextPlanType: RipplePlanType) {
    setForm((current) => ({
      ...current,
      planType: nextPlanType,
      rippleType: nextPlanType === "scheduled_expense" ? "fixed" : "flexible",
      waveType: nextPlanType === "monthly_allowance" ? current.waveType ?? "recurring" : "recurring",
      recurrence: nextPlanType === "weekly_allowance"
        ? current.recurrence ?? getDefaultRecurrence()
        : nextPlanType === "monthly_allowance"
          ? current.recurrence?.type === "monthly" ? current.recurrence : { type: "monthly", daysOfMonth: [1], activeMonths: current.recurrence?.activeMonths }
          : current.recurrence ?? getDefaultRecurrence(),
      oneTimeDate: nextPlanType === "monthly_allowance" && current.waveType === "oneTime" ? current.oneTimeDate ?? monthDateFromValue(currentMonthValue()) : undefined,
    }));
  }

  return (
    <div className="mt-4 rounded-lg border border-harbor-teal-light bg-harbor-offwhite p-4">
      <h3 className="font-bold">{form.id ? "Edit Ripple" : "New Ripple"}</h3>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <Field label="Name"><input autoFocus className="field" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Groceries" /></Field>
        <Field label="Amount"><MoneyInput value={form.defaultAmount} onChange={(value) => setForm((current) => ({ ...current, defaultAmount: value }))} /></Field>
        <Field label="Plan Type">
          <select className="field" value={planType} onChange={(event) => setPlanType(event.target.value as RipplePlanType)}>
            <option value="weekly_allowance">Weekly Allowance</option>
            <option value="monthly_allowance">Monthly Allowance</option>
            <option value="scheduled_expense">Scheduled Expense</option>
          </select>
        </Field>
        <Field label="Chart">
          <select className="field" value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}>
            {charts.map((chart) => <option key={chart} value={chart}>{chart}</option>)}
          </select>
        </Field>
        <Field label={planType === "scheduled_expense" ? "Payment Method" : "Default Payment"}>
          <select className="field" value={form.paymentMethod} onChange={(event) => setForm((current) => ({ ...current, paymentMethod: event.target.value as PaymentMethod }))}>
            {paymentOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </Field>
        {planType === "weekly_allowance" && (
          <AllowanceScheduleFields recurrence={recurrence} onChange={setForm} />
        )}
        {(planType === "weekly_allowance" || planType === "monthly_allowance") && form.paymentMethod === "checking" && (
          <label className="flex items-center gap-2 self-end rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-harbor-navy/65">
            <input type="checkbox" checked={Boolean(form.includeInCashForecast)} onChange={(event) => setForm((current) => ({ ...current, includeInCashForecast: event.target.checked }))} />
            Show in Dock forecast
          </label>
        )}
        {planType === "monthly_allowance" && (
          <>
            <Field label="Month Pattern">
              <select className="field" value={form.waveType === "oneTime" ? "oneTime" : "recurring"} onChange={(event) => setForm((current) => ({
                ...current,
                waveType: event.target.value as "recurring" | "oneTime",
                oneTimeDate: event.target.value === "oneTime" ? current.oneTimeDate ?? monthDateFromValue(currentMonthValue()) : undefined,
                recurrence: event.target.value === "recurring" ? current.recurrence ?? { type: "monthly", daysOfMonth: [1] } : undefined,
              }))}>
                <option value="recurring">Repeats by month</option>
                <option value="oneTime">One-time budget month</option>
              </select>
            </Field>
            {form.waveType !== "oneTime" && (
              <Field label="Anchor Date">
                <MonthDaySelect
                  value={form.recurrence?.daysOfMonth?.[0] ?? 1}
                  onChange={(day) => setForm((current) => ({ ...current, recurrence: { type: "monthly", daysOfMonth: [day], activeMonths: current.recurrence?.activeMonths } }))}
                />
              </Field>
            )}
            {form.waveType !== "oneTime" && (
              <div className="md:col-span-2">
                <ActiveMonthsSelect
                  recurrence={form.recurrence ?? { type: "monthly", daysOfMonth: [1] }}
                  onChange={(next) => setForm((current) => ({ ...current, recurrence: next }))}
                />
              </div>
            )}
            {form.waveType === "oneTime" && <Field label="Budget Month"><input className="field" type="month" value={monthValueFromDate(form.oneTimeDate)} onChange={(event) => setForm((current) => ({ ...current, oneTimeDate: monthDateFromValue(event.target.value) }))} /></Field>}
          </>
        )}
        {planType === "scheduled_expense" && (
          <>
            <Field label="Expense Behavior">
              <select className="field" value={form.waveType === "oneTime" ? "oneTime" : "recurring"} onChange={(event) => setForm((current) => ({
                ...current,
                waveType: event.target.value as "recurring" | "oneTime",
                oneTimeDate: event.target.value === "oneTime" ? current.oneTimeDate ?? todayISODate() : undefined,
                recurrence: event.target.value === "recurring" ? current.recurrence ?? getDefaultRecurrence() : undefined,
                preferredPaymentDate: event.target.value === "oneTime" ? current.preferredPaymentDate ?? current.oneTimeDate ?? todayISODate() : current.preferredPaymentDate,
              }))}>
                <option value="recurring">Repeats</option>
                <option value="oneTime">One time</option>
              </select>
            </Field>
            <ScheduleFields form={form} recurrence={recurrence} onChange={setForm} />
          </>
        )}
      </div>
      <PlanHint planType={planType} paymentMethod={form.paymentMethod} includeInCashForecast={form.includeInCashForecast} />
      <FormActions onSave={() => void onSave(form)} onCancel={onCancel} />
    </div>
  );
}

function WaveForm({ item, onSave, onCancel }: { item: EditingItem; onSave: (item: EditingItem) => void | Promise<void>; onCancel: () => void }) {
  const [form, setForm] = useState<EditingItem>(item);
  const recurrence = form.recurrence ?? getDefaultRecurrence();
  return (
    <div className="mt-4 rounded-lg border border-harbor-teal-light bg-harbor-offwhite p-4">
      <h3 className="font-bold">{form.id ? "Edit Wave" : "New Wave"}</h3>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <Field label="Name"><input autoFocus className="field" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Main Pay" /></Field>
        <Field label="Amount"><MoneyInput value={form.defaultAmount} onChange={(value) => setForm((current) => ({ ...current, defaultAmount: value }))} /></Field>
        <Field label="Wave Type">
          <select className="field" value={form.waveType ?? "recurring"} onChange={(event) => setForm((current) => ({ ...current, waveType: event.target.value as "recurring" | "oneTime", oneTimeDate: event.target.value === "oneTime" ? current.oneTimeDate ?? todayISODate() : undefined, recurrence: event.target.value === "recurring" ? current.recurrence ?? getDefaultRecurrence() : undefined }))}>
            <option value="recurring">Recurring Income</option>
            <option value="oneTime">One-Time Income</option>
          </select>
        </Field>
        <Field label="Destination"><input className="field" value="Checking" disabled /></Field>
        {form.waveType === "oneTime" ? (
          <Field label="Date"><input className="field" type="date" value={form.oneTimeDate ?? todayISODate()} onChange={(event) => setForm((current) => ({ ...current, oneTimeDate: event.target.value }))} /></Field>
        ) : (
          <ScheduleFields form={form} recurrence={recurrence} onChange={setForm} income />
        )}
      </div>
      <p className="mt-3 text-xs text-harbor-navy/55">Dock cash-in. Waves define expected deposits, not Budget spending.</p>
      <FormActions onSave={() => void onSave(form)} onCancel={onCancel} />
    </div>
  );
}

function AllowanceScheduleFields({ recurrence, onChange }: { recurrence: Recurrence; onChange: React.Dispatch<React.SetStateAction<EditingItem>> }) {
  function setRecurrence(next: Recurrence) {
    onChange((current) => ({ ...current, recurrence: next, frequency: frequencyForRecurrence(next), anchorDate: next.startDate }));
  }

  function setCadence(value: "weekly" | "biweekly" | "twiceMonthly" | "monthly") {
    const startDate = recurrence.startDate ?? todayISODate();
    const activeMonths = recurrence.activeMonths;
    const next: Record<typeof value, Recurrence> = {
      weekly: { type: "weekly", daysOfWeek: recurrence.daysOfWeek ?? [5], activeMonths },
      biweekly: { type: "biweekly", daysOfWeek: recurrence.daysOfWeek ?? [5], startDate, activeMonths },
      twiceMonthly: { type: "twiceMonthly", daysOfMonth: recurrence.daysOfMonth?.slice(0, 2) ?? [1, 15], activeMonths },
      monthly: { type: "monthly", daysOfMonth: [recurrence.daysOfMonth?.[0] ?? 1], activeMonths },
    };
    setRecurrence(next[value]);
  }

  return (
    <>
      <Field label="Allowance Schedule">
        <select className="field" value={recurrence.type === "biweekly" || recurrence.type === "twiceMonthly" || recurrence.type === "monthly" ? recurrence.type : "weekly"} onChange={(event) => setCadence(event.target.value as "weekly" | "biweekly" | "twiceMonthly" | "monthly")}>
          <option value="weekly">Every week</option>
          <option value="biweekly">Every other week</option>
          <option value="twiceMonthly">Twice a month</option>
          <option value="monthly">Once a month</option>
        </select>
      </Field>
      {(recurrence.type === "weekly" || recurrence.type === "biweekly") && (
        <Field label="Day of Week">
          <select className="field" value={recurrence.daysOfWeek?.[0] ?? 5} onChange={(event) => setRecurrence({ ...recurrence, daysOfWeek: [Number(event.target.value)] })}>
            {DAY_LABELS.map((label, index) => <option key={label} value={index}>{label}</option>)}
          </select>
        </Field>
      )}
      {recurrence.type === "biweekly" && (
        <Field label="Starting Date"><input className="field" type="date" value={recurrence.startDate ?? todayISODate()} onChange={(event) => setRecurrence({ ...recurrence, startDate: event.target.value })} /></Field>
      )}
      {recurrence.type === "twiceMonthly" && (
        <>
          <Field label="First Date"><MonthDaySelect value={recurrence.daysOfMonth?.[0]} onChange={(day) => setRecurrence({ ...recurrence, daysOfMonth: [day, recurrence.daysOfMonth?.[1] ?? 15] })} /></Field>
          <Field label="Second Date"><MonthDaySelect value={recurrence.daysOfMonth?.[1] ?? 15} onChange={(day) => setRecurrence({ ...recurrence, daysOfMonth: [recurrence.daysOfMonth?.[0] ?? 1, day] })} /></Field>
        </>
      )}
      {recurrence.type === "monthly" && (
        <Field label="Date of Month"><MonthDaySelect value={recurrence.daysOfMonth?.[0]} onChange={(day) => setRecurrence({ ...recurrence, daysOfMonth: [day] })} /></Field>
      )}
      <div className="md:col-span-2">
        <ActiveMonthsSelect recurrence={recurrence} onChange={setRecurrence} />
      </div>
    </>
  );
}

function ScheduleFields({ form, recurrence, onChange, income }: { form: EditingItem; recurrence: Recurrence; onChange: React.Dispatch<React.SetStateAction<EditingItem>>; income?: boolean }) {
  function setRecurrence(next: Recurrence) {
    onChange((current) => ({ ...current, recurrence: next, frequency: frequencyForRecurrence(next), anchorDate: next.startDate }));
  }

  function setRecurrenceType(nextType: Recurrence["type"]) {
    const startDate = recurrence.startDate ?? todayISODate();
    const day = recurrence.daysOfMonth?.[0] ?? new Date(`${startDate}T00:00:00`).getDate();
    const defaults: Record<Recurrence["type"], Recurrence> = {
      weekly: { type: "weekly", daysOfWeek: recurrence.daysOfWeek ?? [5] },
      biweekly: { type: "biweekly", daysOfWeek: recurrence.daysOfWeek ?? [5], startDate },
      twiceMonthly: { type: "twiceMonthly", daysOfMonth: recurrence.daysOfMonth?.slice(0, 2) ?? [1, 15] },
      monthly: { type: "monthly", daysOfMonth: [recurrence.daysOfMonth?.[0] ?? 1] },
      quarterly: { type: "quarterly", startDate, daysOfMonth: [day] },
      semiannual: { type: "semiannual", startDate, daysOfMonth: [day] },
      annual: { type: "annual", startDate, daysOfMonth: [day] },
      custom: { type: "custom", interval: recurrence.interval ?? 1, unit: recurrence.unit ?? "weeks", startDate },
    };
    setRecurrence(defaults[nextType]);
  }

  if (form.waveType === "oneTime") {
    if (income) {
      return <Field label="Date"><input className="field" type="date" value={form.oneTimeDate ?? todayISODate()} onChange={(event) => onChange((current) => ({ ...current, oneTimeDate: event.target.value }))} /></Field>;
    }

    return (
      <>
        <Field label="Budget Date"><input className="field" type="date" value={form.oneTimeDate ?? todayISODate()} onChange={(event) => onChange((current) => ({ ...current, oneTimeDate: event.target.value, preferredPaymentDate: current.preferredPaymentDate ?? event.target.value }))} /></Field>
        <Field label="Payment Date"><input className="field" type="date" value={form.preferredPaymentDate ?? form.oneTimeDate ?? todayISODate()} onChange={(event) => onChange((current) => ({ ...current, preferredPaymentDate: event.target.value }))} /></Field>
      </>
    );
  }

  return (
    <>
      <Field label={income ? "Income Schedule" : "Schedule"}>
        <select className="field" value={recurrence.type} onChange={(event) => setRecurrenceType(event.target.value as Recurrence["type"])}>
          <option value="weekly">Weekly</option>
          <option value="biweekly">Every two weeks</option>
          <option value="twiceMonthly">Twice monthly</option>
          <option value="monthly">Monthly</option>
          <option value="quarterly">Quarterly</option>
          <option value="semiannual">Every 6 months</option>
          <option value="annual">Yearly</option>
          <option value="custom">Custom</option>
        </select>
      </Field>
      {(recurrence.type === "weekly" || recurrence.type === "biweekly") && (
        <Field label="Day of Week">
          <select className="field" value={recurrence.daysOfWeek?.[0] ?? 5} onChange={(event) => setRecurrence({ ...recurrence, daysOfWeek: [Number(event.target.value)] })}>
            {DAY_LABELS.map((label, index) => <option key={label} value={index}>{label}</option>)}
          </select>
        </Field>
      )}
      {recurrence.type === "biweekly" && <Field label="Starting Date"><input className="field" type="date" value={recurrence.startDate ?? todayISODate()} onChange={(event) => setRecurrence({ ...recurrence, startDate: event.target.value })} /></Field>}
      {recurrence.type === "twiceMonthly" && (
        <>
          <Field label="First Date"><MonthDaySelect value={recurrence.daysOfMonth?.[0]} onChange={(day) => setRecurrence({ ...recurrence, daysOfMonth: [day, recurrence.daysOfMonth?.[1] ?? 15] })} /></Field>
          <Field label="Second Date"><MonthDaySelect value={recurrence.daysOfMonth?.[1] ?? 15} onChange={(day) => setRecurrence({ ...recurrence, daysOfMonth: [recurrence.daysOfMonth?.[0] ?? 1, day] })} /></Field>
        </>
      )}
      {recurrence.type === "monthly" && <Field label="Date of Month"><MonthDaySelect value={recurrence.daysOfMonth?.[0]} onChange={(day) => setRecurrence({ ...recurrence, daysOfMonth: [day] })} /></Field>}
      {(recurrence.type === "quarterly" || recurrence.type === "semiannual" || recurrence.type === "annual") && (
        <>
          <Field label="Starting Date"><input className="field" type="date" value={recurrence.startDate ?? todayISODate()} onChange={(event) => setRecurrence({ ...recurrence, startDate: event.target.value })} /></Field>
          <Field label="Date of Month"><MonthDaySelect value={recurrence.daysOfMonth?.[0]} onChange={(day) => setRecurrence({ ...recurrence, daysOfMonth: [day] })} /></Field>
        </>
      )}
      {recurrence.type === "custom" && (
        <>
          <Field label="Every"><input className="field" type="number" min="1" value={recurrence.interval ?? 1} onChange={(event) => setRecurrence({ ...recurrence, interval: Math.max(1, Number(event.target.value) || 1) })} /></Field>
          <Field label="Unit">
            <select className="field" value={recurrence.unit ?? "weeks"} onChange={(event) => setRecurrence({ ...recurrence, unit: event.target.value as RecurrenceUnit })}>
              <option value="days">Days</option>
              <option value="weeks">Weeks</option>
              <option value="months">Months</option>
            </select>
          </Field>
        </>
      )}
    </>
  );
}

function MonthDaySelect({ value, onChange }: { value: DayOfMonth | undefined; onChange: (day: DayOfMonth) => void }) {
  return (
    <select className="field" value={dayOfMonthValue(value)} onChange={(event) => onChange(parseDayOfMonth(event.target.value))}>
      {MONTH_DAY_OPTIONS.map((day) => <option key={day} value={day}>{day === "last" ? "Last day" : day}</option>)}
    </select>
  );
}

function ActiveMonthsSelect({ recurrence, onChange }: { recurrence: Recurrence; onChange: (recurrence: Recurrence) => void }) {
  const activeMonths = recurrence.activeMonths?.length ? recurrence.activeMonths : MONTH_LABELS.map((_, index) => index + 1);
  const allYear = activeMonths.length === 12;

  function toggleMonth(month: number) {
    const next = activeMonths.includes(month)
      ? activeMonths.filter((item) => item !== month)
      : [...activeMonths, month].sort((a, b) => a - b);
    onChange({ ...recurrence, activeMonths: next.length === 12 ? undefined : next });
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-harbor-navy/45">Months Each Year</span>
        <button type="button" onClick={() => onChange({ ...recurrence, activeMonths: undefined })} className="text-xs font-semibold text-harbor-teal">
          All months
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {MONTH_LABELS.map((label, index) => {
          const month = index + 1;
          const active = allYear || activeMonths.includes(month);
          return (
            <button
              key={label}
              type="button"
              onClick={() => toggleMonth(month)}
              className={`rounded-md border px-2 py-1.5 text-xs font-semibold ${active ? "border-harbor-teal bg-white text-harbor-teal" : "border-slate-200 bg-slate-100 text-harbor-navy/35"}`}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MoneyInput({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-harbor-navy/35">$</span>
      <input className="field" style={{ paddingLeft: "2rem" }} type="number" min="0" step="0.01" value={value || ""} onChange={(event) => onChange(Number(event.target.value))} />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1">
      <span className="text-xs font-semibold uppercase tracking-wide text-harbor-navy/45">{label}</span>
      {children}
    </label>
  );
}

function PlanHint({ planType, paymentMethod, includeInCashForecast }: { planType: RipplePlanType; paymentMethod: PaymentMethod; includeInCashForecast?: boolean }) {
  const text = planType === "weekly_allowance"
    ? includeInCashForecast
      ? "Budget allowance with expected checking cash in Dock until actual spending is logged."
      : "Budget allowance only. Dock updates when spending is logged."
    : planType === "monthly_allowance"
      ? includeInCashForecast
        ? "Monthly budget allowance with expected checking cash in Dock."
        : "An amount available throughout the month. Purchases consume it as they happen."
      : paymentMethod === "checking"
        ? "Planned in Budget and included in Dock when scheduled."
        : "Planned in Budget and routed into a future Fleet payment.";
  return <p className="mt-3 text-xs text-harbor-navy/55">{text}</p>;
}

function FormActions({ onSave, onCancel }: { onSave: () => void; onCancel: () => void }) {
  return (
    <div className="mt-4 flex gap-2">
      <button type="button" onClick={onSave} className="rounded-lg bg-harbor-teal px-4 py-2 text-sm font-semibold text-white">Save</button>
      <button type="button" onClick={onCancel} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-harbor-navy/60">Cancel</button>
    </div>
  );
}
