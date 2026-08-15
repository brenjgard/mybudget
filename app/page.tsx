"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { loadSettingsWithSupabaseFallback } from "./lib/budget-settings";
import type { Buoy } from "./lib/local-repo";
import { budgetRepo } from "./lib/repositories/budget-repo";
import { getItemBehavior } from "./lib/ripple-type";
import { buildProjectedAmounts, getWeekRanges, lineItemAppliesToWeek, lineItemOccurrenceDatesForWeek } from "./lib/schedule";
import type { AppSettings, CreditCardAccount, DockItemState, LineItem, PaymentMethod, SpendLogEntry } from "./lib/types";

type ViewMode = "budget" | "cash";
type DockGroup = "income" | "standardBills" | "food" | "pets" | "other" | "cardPayments";

type CardPaymentRow = {
  id: string;
  cardId?: PaymentMethod;
  sourceMonthKey: string;
  name: string;
  amount: number;
  budgetWeekIndex: number;
  cashWeekIndex: number;
  date: string;
  status: DockItemState["status"];
  note?: string;
  projected?: boolean;
};

type CashEvent = {
  id: string;
  rowId: string;
  date: Date;
  label: string;
  amount: number;
  kind: "income" | "checkingBill" | "cardPayment" | "transfer";
  sourceMonthKey: string;
};

type WeeklyCash = {
  starting: number;
  inflows: number;
  checkingOutflows: number;
  cardPayments: number;
  transfers: number;
  lowest: number;
  lowestDate: Date;
  ending: number;
};

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function formatShortDate(date: Date) {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
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

function monthPartsFromKey(value: string) {
  const [year, month] = value.split("-").map(Number);
  return { year, month: month - 1 };
}

function addMonths(year: number, month: number, delta: number) {
  const date = new Date(year, month + delta, 1);
  return { year: date.getFullYear(), month: date.getMonth(), monthKey: monthKeyFor(date.getFullYear(), date.getMonth()) };
}

function todayISODate() {
  return isoDate(new Date());
}

function cardPaymentIdFor(cardId: PaymentMethod) {
  return `scheduled-card-payment:${cardId}:${crypto.randomUUID()}`;
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

function cashEventMapKey(rowId: string, weekIndex: number) {
  return `${rowId}:${weekIndex}`;
}

function cashEventKindLabel(kind: CashEvent["kind"]) {
  switch (kind) {
    case "income":
      return "Income";
    case "checkingBill":
      return "Checking bill";
    case "cardPayment":
      return "Card payment";
    case "transfer":
      return "Transfer";
  }
}

function cashEventImpact(event: CashEvent) {
  return event.kind === "income" ? event.amount : -event.amount;
}

function amountForWeek(amounts: Record<string, Record<number, number>>, item: LineItem, weekIndex: number) {
  return Number(amounts[item.id]?.[weekIndex] ?? 0);
}

function lastDayOfMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function dateForMonthDay(year: number, month: number, day: number) {
  return new Date(year, month, Math.min(day, lastDayOfMonth(year, month)));
}

function projectedPaymentDate(card: CreditCardAccount, year: number, month: number) {
  const dueDay = card.paymentDueDay;
  if (!dueDay) return null;

  const dueMonthOffset = dueDay <= (card.statementClosingDay ?? 31) ? 1 : 0;
  const dueMonth = addMonths(year, month, dueMonthOffset);

  if (card.preferredPaymentTiming === "specific_day" && card.preferredPaymentDay) {
    return dateForMonthDay(dueMonth.year, dueMonth.month, card.preferredPaymentDay);
  }

  const dueDate = dateForMonthDay(dueMonth.year, dueMonth.month, dueDay);
  if (card.preferredPaymentTiming === "days_before_due") {
    const date = new Date(dueDate);
    date.setDate(date.getDate() - (card.preferredPaymentDaysBeforeDue ?? 0));
    return date;
  }

  return dueDate;
}

function parseDateOnly(value?: string) {
  if (!value) return null;
  const [datePart] = value.split("T");
  const [parsedYear, parsedMonth, parsedDay] = datePart.split("-").map(Number);
  if (!parsedYear || !parsedMonth || !parsedDay) return null;
  return new Date(parsedYear, parsedMonth - 1, parsedDay);
}

function weekIndexForDate(weeks: { start: Date; end: Date }[], date: Date) {
  return weeks.findIndex((week) => date >= week.start && date <= week.end);
}

function visibleWeekIndexForDate(weeks: { start: Date; end: Date }[], date: Date) {
  return weeks.findIndex((week) => date >= week.start && date <= week.end);
}

function checkingCashDatesForItem({
  item,
  state,
  weekIndex,
  week,
  month,
  totalWeeks,
}: {
  item: LineItem;
  state?: DockItemState;
  weekIndex: number;
  week: { start: Date; end: Date };
  month: number;
  totalWeeks: number;
}) {
  const paidDate = state?.status === "cleared" ? parseDateOnly(state.clearedAt) : null;
  if (paidDate) return { dates: [paidDate], usesFallbackOccurrence: false };

  const scheduledDate = parseDateOnly(state?.pendingUntil);
  if (scheduledDate) return { dates: [scheduledDate], usesFallbackOccurrence: false };

  const preferredDate = parseDateOnly(item.preferredPaymentDate);
  if (preferredDate) return { dates: [preferredDate], usesFallbackOccurrence: false };

  const dueDate = parseDateOnly(item.paymentDueDate);
  if (dueDate) return { dates: [dueDate], usesFallbackOccurrence: false };

  return {
    dates: lineItemOccurrenceDatesForWeek(item, weekIndex, week.start, week.end, month, totalWeeks),
    usesFallbackOccurrence: true,
  };
}

function budgetWeekForCard(card: CreditCardAccount, weeks: { start: Date; end: Date }[], year: number, month: number) {
  const closeDate = dateForMonthDay(year, month, card.statementClosingDay ?? lastDayOfMonth(year, month));
  const closeWeek = weekIndexForDate(weeks, closeDate);
  return closeWeek >= 0 ? closeWeek : Math.max(0, weeks.length - 1);
}

function scheduledCardIdFromState(state: DockItemState, cards: CreditCardAccount[]) {
  const [, cardId] = state.itemId.match(/^scheduled-card-payment:([^:]+):/) ?? [];
  if (cardId) return cardId as PaymentMethod;

  const note = state.note?.trim().toLowerCase() ?? "";
  return cards.find((card) => {
    const label = card.label.trim().toLowerCase();
    return label && note.includes(label);
  })?.id;
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
  const [previousAmounts, setPreviousAmounts] = useState<Record<string, Record<number, number>>>({});
  const [nextAmounts, setNextAmounts] = useState<Record<string, Record<number, number>>>({});
  const [spendLogs, setSpendLogs] = useState<SpendLogEntry[]>([]);
  const [previousSpendLogs, setPreviousSpendLogs] = useState<SpendLogEntry[]>([]);
  const [nextSpendLogs, setNextSpendLogs] = useState<SpendLogEntry[]>([]);
  const [dockStates, setDockStates] = useState<DockItemState[]>([]);
  const [previousDockStates, setPreviousDockStates] = useState<DockItemState[]>([]);
  const [nextDockStates, setNextDockStates] = useState<DockItemState[]>([]);
  const [buoys, setBuoys] = useState<Buoy[]>([]);
  const [checkingBalance, setCheckingBalance] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [monthLoading, setMonthLoading] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("budget");
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [expandedCashWeeks, setExpandedCashWeeks] = useState<Record<number, boolean>>({});
  const [cardSpendDraft, setCardSpendDraft] = useState({ itemId: "", weekIndex: 0, amount: "", cardId: "", date: todayISODate() });
  const [paymentDraft, setPaymentDraft] = useState({ cardId: "", amount: "", date: todayISODate(), note: "" });

  const monthKey = monthKeyFor(year, month);
  const previousMonth = useMemo(() => addMonths(year, month, -1), [month, year]);
  const nextMonth = useMemo(() => addMonths(year, month, 1), [month, year]);
  const monthName = useMemo(
    () => new Date(year, month, 1).toLocaleString("en-US", { month: "long", year: "numeric" }),
    [month, year],
  );
  const weeks = useMemo(() => getWeekRanges(year, month), [month, year]);
  const cashWindowStart = weeks[0]?.start;
  const cashWindowEnd = weeks.at(-1)?.end;

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
      setPreviousAmounts({});
      setNextAmounts({});
      setSpendLogs([]);
      setPreviousSpendLogs([]);
      setNextSpendLogs([]);
      setDockStates([]);
      setPreviousDockStates([]);
      setNextDockStates([]);
      const previousWeeks = getWeekRanges(previousMonth.year, previousMonth.month);
      const nextWeeks = getWeekRanges(nextMonth.year, nextMonth.month);
      const [
        savedAmounts,
        savedPreviousAmounts,
        savedNextAmounts,
        savedSpendLogs,
        savedDockStates,
        savedPreviousSpendLogs,
        savedPreviousDockStates,
        savedNextSpendLogs,
        savedNextDockStates,
        savedBuoys,
      ] = await Promise.all([
        budgetRepo.getMonthlyAmounts(monthKey),
        budgetRepo.getMonthlyAmounts(previousMonth.monthKey),
        budgetRepo.getMonthlyAmounts(nextMonth.monthKey),
        budgetRepo.getSpendLogs(monthKey),
        budgetRepo.getDockItemStates(monthKey),
        budgetRepo.getSpendLogs(previousMonth.monthKey),
        budgetRepo.getDockItemStates(previousMonth.monthKey),
        budgetRepo.getSpendLogs(nextMonth.monthKey),
        budgetRepo.getDockItemStates(nextMonth.monthKey),
        budgetRepo.getBuoys(),
      ]);
      if (cancelled) return;
      setAmounts(buildProjectedAmounts(monthSettings, weeks, month, savedAmounts));
      setPreviousAmounts(buildProjectedAmounts(monthSettings, previousWeeks, previousMonth.month, savedPreviousAmounts));
      setNextAmounts(buildProjectedAmounts(monthSettings, nextWeeks, nextMonth.month, savedNextAmounts));
      setSpendLogs(savedSpendLogs);
      setDockStates(savedDockStates);
      setPreviousSpendLogs(savedPreviousSpendLogs);
      setPreviousDockStates(savedPreviousDockStates);
      setNextSpendLogs(savedNextSpendLogs);
      setNextDockStates(savedNextDockStates);
      setBuoys(savedBuoys);
      setMonthLoading(false);
    }

    void loadMonth();
    return () => {
      cancelled = true;
    };
  }, [month, monthKey, nextMonth.month, nextMonth.monthKey, nextMonth.year, previousMonth.month, previousMonth.monthKey, previousMonth.year, settings, weeks]);

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

  const scheduledCardPayments = useMemo<CardPaymentRow[]>(() => {
    if (!settings) return [];
    const currentSettings = settings;

    function buildCardPaymentsForSource({
      sourceMonthKey,
      sourceSpendLogs,
      sourceDockStates,
    }: {
      sourceMonthKey: string;
      sourceSpendLogs: SpendLogEntry[];
      sourceDockStates: DockItemState[];
    }) {
      const sourceMonth = monthPartsFromKey(sourceMonthKey);
      const sourceWeeks = sourceMonthKey === monthKey ? weeks : getWeekRanges(sourceMonth.year, sourceMonth.month);

      const manualPayments = sourceDockStates
        .filter((state) => state.itemId.startsWith("scheduled-card-payment:") && state.itemKind === "credit_card_payment")
        .map((state) => {
          const paymentDate = state.pendingUntil ? new Date(`${state.pendingUntil}T00:00:00`) : sourceWeeks[state.weekIndex]?.start;
          return {
            id: state.itemId,
            cardId: scheduledCardIdFromState(state, currentSettings.creditCards),
            sourceMonthKey,
            name: state.note || "Scheduled card payment",
            amount: Number(state.actualAmount ?? state.plannedAmount ?? 0),
            budgetWeekIndex: state.weekIndex,
            cashWeekIndex: paymentDate ? visibleWeekIndexForDate(weeks, paymentDate) : -1,
            date: paymentDate ? isoDate(paymentDate) : "",
            status: state.status,
            note: state.note,
          };
        })
        .filter((payment) => payment.amount > 0);

      const manualCardIds = new Set(
        manualPayments
          .filter((payment) => payment.status !== "skipped" && payment.cardId)
          .map((payment) => payment.cardId),
      );
      const cardSpendByCard = sourceSpendLogs
        .filter((entry) => isCardMethod(entry.paymentMethod))
        .reduce<Record<string, number>>((totalsByCard, entry) => ({
          ...totalsByCard,
          [entry.paymentMethod]: (totalsByCard[entry.paymentMethod] ?? 0) + entry.amount,
        }), {});

      const projectedPayments = currentSettings.creditCards.flatMap<CardPaymentRow>((card) => {
        if (manualCardIds.has(card.id)) return [];
        const amount = cardSpendByCard[card.id] ?? 0;
        if (amount <= 0) return [];

        const paymentDate = projectedPaymentDate(card, sourceMonth.year, sourceMonth.month);
        if (!paymentDate) return [];

        return [{
          id: `projected-card-payment:${card.id}:${sourceMonthKey}`,
          cardId: card.id,
          sourceMonthKey,
          name: `${card.label} payment`,
          amount,
          budgetWeekIndex: budgetWeekForCard(card, sourceWeeks, sourceMonth.year, sourceMonth.month),
          cashWeekIndex: visibleWeekIndexForDate(weeks, paymentDate),
          date: isoDate(paymentDate),
          status: "upcoming",
          projected: true,
        }];
      });

      return [...manualPayments, ...projectedPayments];
    }

    return [
      ...buildCardPaymentsForSource({ sourceMonthKey: monthKey, sourceSpendLogs: spendLogs, sourceDockStates: dockStates }),
      ...buildCardPaymentsForSource({ sourceMonthKey: previousMonth.monthKey, sourceSpendLogs: previousSpendLogs, sourceDockStates: previousDockStates }),
    ];
  }, [dockStates, monthKey, previousDockStates, previousMonth.monthKey, previousSpendLogs, settings, spendLogs, weeks]);

  const startingChecking = Number(checkingBalance || 0);

  const cashEvents = useMemo<CashEvent[]>(() => {
    if (!settings || !cashWindowStart || !cashWindowEnd) return [];
    const events: CashEvent[] = [];

    const isInCashWindow = (date: Date) => date >= cashWindowStart && date <= cashWindowEnd;
    const eventSources = [
      {
        monthKey: previousMonth.monthKey,
        month: previousMonth.month,
        weeks: getWeekRanges(previousMonth.year, previousMonth.month),
        amounts: previousAmounts,
        dockStates: previousDockStates,
        spendLogs: previousSpendLogs,
      },
      {
        monthKey,
        month,
        weeks,
        amounts,
        dockStates,
        spendLogs,
      },
      {
        monthKey: nextMonth.monthKey,
        month: nextMonth.month,
        weeks: getWeekRanges(nextMonth.year, nextMonth.month),
        amounts: nextAmounts,
        dockStates: nextDockStates,
        spendLogs: nextSpendLogs,
      },
    ];

    eventSources.forEach((source) => {
      const sourceStatesByItemWeek = new Map<string, DockItemState>();
      source.dockStates.forEach((state) => sourceStatesByItemWeek.set(stateKey(state.itemId, state.weekIndex), state));

      const sourceSpendLogsByItemWeek = new Map<string, SpendLogEntry[]>();
      source.spendLogs.forEach((entry) => {
        const key = stateKey(entry.rippleId, entry.weekIndex);
        sourceSpendLogsByItemWeek.set(key, [...(sourceSpendLogsByItemWeek.get(key) ?? []), entry]);
      });

      source.weeks.forEach((week, weekIndex) => {
        incomeRows.forEach((item) => {
          if (!lineItemAppliesToWeek(item, weekIndex, week.start, week.end, source.month, source.weeks.length)) return;
          const state = sourceStatesByItemWeek.get(stateKey(item.id, weekIndex));
          if (state?.status === "skipped" || state?.status === "cleared") return;
          const amount = Number(state?.actualAmount ?? amountForWeek(source.amounts, item, weekIndex));
          if (amount <= 0) return;

          const dates = lineItemOccurrenceDatesForWeek(item, weekIndex, week.start, week.end, source.month, source.weeks.length)
            .filter(isInCashWindow);
          const amountPerDate = dates.length > 0 ? amount / dates.length : amount;
          dates.forEach((date) => events.push({
            id: `${source.monthKey}:${item.id}:${weekIndex}:${isoDate(date)}:income`,
            rowId: item.id,
            date,
            label: item.name,
            amount: amountPerDate,
            kind: "income",
            sourceMonthKey: source.monthKey,
          }));
        });

        budgetRows.forEach((item) => {
          if (isCardMethod(item.paymentMethod)) return;
          if (!lineItemAppliesToWeek(item, weekIndex, week.start, week.end, source.month, source.weeks.length) && !hasWeekAmount(source.amounts, item, weekIndex)) return;
          const state = sourceStatesByItemWeek.get(stateKey(item.id, weekIndex));
          if (state?.status === "skipped") return;

          const actualCashEntries = sourceSpendLogsByItemWeek.get(stateKey(item.id, weekIndex))?.filter((entry) => entry.paymentMethod === "checking") ?? [];
          if (actualCashEntries.length > 0) {
            actualCashEntries.forEach((entry) => {
              const date = new Date(`${entry.date}T00:00:00`);
              if (isInCashWindow(date)) {
                events.push({
                  id: `${source.monthKey}:${entry.id}:checking`,
                  rowId: item.id,
                  date,
                  label: entry.note?.trim() || item.name,
                  amount: entry.amount,
                  kind: "checkingBill",
                  sourceMonthKey: source.monthKey,
                });
              }
            });
            return;
          }

          const amount = Number(state?.actualAmount ?? amountForWeek(source.amounts, item, weekIndex));
          if (amount <= 0) return;

          const cashDateResult = checkingCashDatesForItem({
            item,
            state,
            weekIndex,
            week,
            month: source.month,
            totalWeeks: source.weeks.length,
          });
          const dates = cashDateResult.dates.filter(isInCashWindow);
          const cashDates = dates.length > 0
            ? dates
            : cashDateResult.usesFallbackOccurrence
              ? [week.start].filter(isInCashWindow)
              : [];
          const amountPerDate = cashDates.length > 0 ? amount / cashDates.length : amount;

          cashDates.forEach((date) => events.push({
            id: `${source.monthKey}:${item.id}:${weekIndex}:${isoDate(date)}:checking`,
            rowId: item.id,
            date,
            label: item.name,
            amount: amountPerDate,
            kind: "checkingBill",
            sourceMonthKey: source.monthKey,
          }));
        });
      });
    });

    scheduledCardPayments
      .filter((payment) => payment.status !== "skipped" && payment.cashWeekIndex >= 0)
      .forEach((payment) => {
        const date = new Date(`${payment.date}T00:00:00`);
        if (isInCashWindow(date)) {
          events.push({
            id: payment.id,
            rowId: payment.id,
            date,
            label: payment.name,
            amount: payment.amount,
            kind: "cardPayment",
            sourceMonthKey: payment.sourceMonthKey,
          });
        }
      });

    eventSources.forEach((source) => {
      const sourceMonth = monthPartsFromKey(source.monthKey);
      buoys.forEach((buoy) => {
        const amount = buoy.autoSave ?? 0;
        if (amount <= 0 || !buoy.autoSaveDay) return;
        const date = dateForMonthDay(sourceMonth.year, sourceMonth.month, buoy.autoSaveDay);
        if (!isInCashWindow(date)) return;

        events.push({
          id: `${source.monthKey}:${buoy.id}:transfer`,
          rowId: `transfer:${buoy.id}`,
          date,
          label: `${buoy.name} transfer`,
          amount,
          kind: "transfer",
          sourceMonthKey: source.monthKey,
        });
      });
    });

    return events.sort((a, b) => a.date.getTime() - b.date.getTime() || a.label.localeCompare(b.label));
  }, [
    amounts,
    budgetRows,
    buoys,
    cashWindowEnd,
    cashWindowStart,
    dockStates,
    incomeRows,
    month,
    monthKey,
    nextAmounts,
    nextDockStates,
    nextMonth.month,
    nextMonth.monthKey,
    nextMonth.year,
    nextSpendLogs,
    previousAmounts,
    previousDockStates,
    previousMonth.month,
    previousMonth.monthKey,
    previousMonth.year,
    previousSpendLogs,
    scheduledCardPayments,
    settings,
    spendLogs,
    weeks,
  ]);

  const weeklyCash = useMemo<WeeklyCash[]>(() => {
    if (!settings) return [];
    let running = startingChecking;
    let eventIndex = 0;

    return weeks.map((week) => {
      const starting = running;
      let inflows = 0;
      let checkingOutflows = 0;
      let cardPayments = 0;
      let transfers = 0;
      let lowest = running;
      let lowestDate = week.start;

      while (eventIndex < cashEvents.length && cashEvents[eventIndex].date <= week.end) {
        const event = cashEvents[eventIndex];
        if (event.kind === "income") {
          inflows += event.amount;
          running += event.amount;
        } else if (event.kind === "cardPayment") {
          cardPayments += event.amount;
          running -= event.amount;
        } else if (event.kind === "transfer") {
          transfers += event.amount;
          running -= event.amount;
        } else {
          checkingOutflows += event.amount;
          running -= event.amount;
        }
        if (running < lowest) {
          lowest = running;
          lowestDate = event.date;
        }
        eventIndex += 1;
      }

      return { starting, inflows, checkingOutflows, cardPayments, transfers, lowest, lowestDate, ending: running };
    });
  }, [cashEvents, settings, startingChecking, weeks]);

  const cashEventsByWeek = useMemo(() => {
    const result = new Map<number, CashEvent[]>();
    cashEvents.forEach((event) => {
      const weekIndex = visibleWeekIndexForDate(weeks, event.date);
      if (weekIndex < 0) return;
      result.set(weekIndex, [...(result.get(weekIndex) ?? []), event]);
    });
    return result;
  }, [cashEvents, weeks]);

  const cashImpactByRowWeek = useMemo(() => {
    const result = new Map<string, number>();
    cashEvents.forEach((event) => {
      const weekIndex = visibleWeekIndexForDate(weeks, event.date);
      if (weekIndex < 0) return;
      const key = cashEventMapKey(event.rowId, weekIndex);
      result.set(key, (result.get(key) ?? 0) + cashEventImpact(event));
    });
    return result;
  }, [cashEvents, weeks]);

  const totals = useMemo(() => {
    const planned = budgetRows.reduce((sum, item) => (
      sum + weeks.reduce((weekSum, week, weekIndex) => {
        if (!lineItemAppliesToWeek(item, weekIndex, week.start, week.end, month, weeks.length) && !hasWeekAmount(amounts, item, weekIndex)) return weekSum;
        return weekSum + amountForWeek(amounts, item, weekIndex);
      }, 0)
    ), 0);
    const actual = spendLogs.reduce((sum, entry) => sum + entry.amount, 0);
    const cardSpend = spendLogs.filter((entry) => isCardMethod(entry.paymentMethod)).reduce((sum, entry) => sum + entry.amount, 0);
    const cardPayments = scheduledCardPayments
      .filter((payment) => payment.sourceMonthKey === monthKey && payment.status !== "skipped")
      .reduce((sum, payment) => sum + payment.amount, 0);
    return {
      planned,
      actual,
      remaining: Math.max(0, planned - actual),
      projectedChecking: weeklyCash.at(-1)?.ending ?? startingChecking,
      cardLiability: Math.max(0, cardSpend - cardPayments),
    };
  }, [amounts, budgetRows, month, monthKey, scheduledCardPayments, spendLogs, startingChecking, weeklyCash, weeks]);

  const displayedCardPayments = useMemo(() => (
    scheduledCardPayments.filter((payment) => (
      viewMode === "cash" && payment.cashWeekIndex >= 0
    ))
  ), [scheduledCardPayments, viewMode]);

  function changeMonth(value: string) {
    const [nextYear, nextMonth] = value.split("-").map(Number);
    if (!nextYear || !nextMonth) return;
    setMonthLoading(true);
    setAmounts({});
    setPreviousAmounts({});
    setNextAmounts({});
    setSpendLogs([]);
    setPreviousSpendLogs([]);
    setNextSpendLogs([]);
    setDockStates([]);
    setPreviousDockStates([]);
    setNextDockStates([]);
    setExpandedCashWeeks({});
    setYear(nextYear);
    setMonth(nextMonth - 1);
  }

  function nudgeMonth(delta: number) {
    const next = new Date(year, month + delta, 1);
    setMonthLoading(true);
    setAmounts({});
    setPreviousAmounts({});
    setNextAmounts({});
    setSpendLogs([]);
    setPreviousSpendLogs([]);
    setNextSpendLogs([]);
    setDockStates([]);
    setPreviousDockStates([]);
    setNextDockStates([]);
    setExpandedCashWeeks({});
    setYear(next.getFullYear());
    setMonth(next.getMonth());
  }

  function toggleGroup(group: DockGroup) {
    setCollapsedGroups((current) => ({ ...current, [group]: !current[group] }));
  }

  function toggleCashWeek(weekIndex: number) {
    setExpandedCashWeeks((current) => ({ ...current, [weekIndex]: !current[weekIndex] }));
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
    const card = settings.creditCards.find((candidate) => candidate.id === paymentDraft.cardId) ?? settings.creditCards[0];
    if (!card) return;
    const weekIndex = budgetWeekForCard(card, weeks, year, month);
    const label = `${card.label} payment`;
    await saveDockState({
      monthKey,
      weekIndex,
      itemId: cardPaymentIdFor(card.id),
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
            <div className="inline-flex w-fit rounded-lg border border-harbor-teal-light bg-white p-1 shadow-sm">
              <button type="button" onClick={() => setViewMode("budget")} className={`rounded-md px-3 py-1.5 text-sm font-semibold ${viewMode === "budget" ? "bg-harbor-teal text-white shadow-sm" : "text-harbor-navy/55 hover:text-harbor-teal"}`}>Budget View</button>
              <button type="button" onClick={() => setViewMode("cash")} className={`rounded-md px-3 py-1.5 text-sm font-semibold ${viewMode === "cash" ? "bg-harbor-teal text-white shadow-sm" : "text-harbor-navy/55 hover:text-harbor-teal"}`}>True Cash View</button>
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
                    const applies = lineItemAppliesToWeek(item, weekIndex, week.start, week.end, month, weeks.length) || hasWeekAmount(amounts, item, weekIndex);
                    const amount = amountForWeek(amounts, item, weekIndex);
                    const cashImpact = cashImpactByRowWeek.get(cashEventMapKey(item.id, weekIndex)) ?? 0;
                    const displayAmount = viewMode === "budget" ? amount : cashImpact;
                    const state = dockStatesByItemWeek.get(stateKey(item.id, weekIndex));
                    const cleared = state?.status === "cleared";
                    const skipped = state?.status === "skipped";
                    return (
                      <td key={weekIndex} className={`px-3 py-3 text-center align-top ${cleared ? "bg-harbor-green/5" : skipped ? "bg-slate-50" : ""}`}>
                        {applies || (viewMode === "cash" && cashImpact !== 0) ? (
                          <div className="space-y-1">
                            {viewMode === "budget" ? (
                              <MoneyInput value={amount} tone="green" onChange={(value) => updatePlannedAmount(item.id, weekIndex, value)} onBlur={saveMonthlyAmounts} />
                            ) : (
                              <div className={`font-bold ${displayAmount > 0 ? "text-harbor-green" : "text-slate-400"}`}>{displayAmount !== 0 ? formatMoney(displayAmount) : "-"}</div>
                            )}
                            <div className="text-[11px] text-harbor-navy/50">{viewMode === "cash" ? "Checking cash inflow" : cleared ? "Received; excluded from future projection" : skipped ? "Skipped" : "Expected income"}</div>
                            {viewMode === "budget" && (cleared ? <StatusPill label="Received" /> : skipped ? <StatusPill label="Skipped" tone="slate" /> : (
                              <div className="flex justify-center gap-2">
                                <button type="button" onClick={() => void markIncomeReceived(item, weekIndex)} className="text-[11px] font-semibold text-harbor-green">Mark received</button>
                                <button type="button" onClick={() => void skipDockItem(item, weekIndex)} className="text-[11px] font-semibold text-slate-500">Skip</button>
                              </div>
                            ))}
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
                  cashImpactByRowWeek={cashImpactByRowWeek}
                  updatePlannedAmount={updatePlannedAmount}
                  saveMonthlyAmounts={saveMonthlyAmounts}
                  markCheckingBillPaid={markCheckingBillPaid}
                  skipDockItem={skipDockItem}
                  toggleGroup={() => toggleGroup(group)}
                />
              ))}

              {displayedCardPayments.length > 0 && <SectionRow label={GROUP_LABELS.cardPayments} collapsed={Boolean(collapsedGroups.cardPayments)} onToggle={() => toggleGroup("cardPayments")} colSpan={2 + weeks.length} />}
              {!monthLoading && !collapsedGroups.cardPayments && displayedCardPayments.map((payment) => {
                const displayWeekIndex = viewMode === "budget" ? payment.budgetWeekIndex : payment.cashWeekIndex;
                return (
                  <tr key={`${viewMode}-${payment.id}`} className="border-b border-slate-100">
                    <RowHeader name={payment.name} category={viewMode === "budget" ? `Cash date ${payment.date}` : payment.date} />
                    <td className="px-3 py-3 text-harbor-navy/65">Checking</td>
                    {weeks.map((_, weekIndex) => (
                      <Cell key={weekIndex} value={displayWeekIndex === weekIndex ? formatMoney(payment.amount) : "-"} note={displayWeekIndex === weekIndex ? payment.status === "cleared" ? "Paid" : payment.projected ? "Projected payment" : "Scheduled payment" : ""} tone="red" />
                    ))}
                  </tr>
                );
              })}

              <SectionRow label="Weekly True Cash Summary" colSpan={2 + weeks.length} />
              <SummaryRow label="Starting Checking Cash" values={weeklyCash.map((week) => week.starting)} />
              <SummaryRow label="Inflows" values={weeklyCash.map((week) => week.inflows)} tone="green" />
              <SummaryRow label="Checking/Cash Outflows" values={weeklyCash.map((week) => week.checkingOutflows)} tone="red" />
              <SummaryRow label="Scheduled Card Payments" values={weeklyCash.map((week) => week.cardPayments)} tone="red" />
              <SummaryRow label="Transfers" values={weeklyCash.map((week) => week.transfers)} tone="red" />
              <SummaryRow label="Lowest Checking Cash" values={weeklyCash.map((week) => week.lowest)} tone="red" />
              <SummaryRow label="Projected Checking Cash" values={weeklyCash.map((week) => week.ending)} sticky tone="green" />
              <WeekDrillDownToggleRow
                weeks={weeks}
                expandedWeeks={expandedCashWeeks}
                onToggle={toggleCashWeek}
              />
              <WeekDrillDownRows
                weeks={weeks}
                weeklyCash={weeklyCash}
                cashEventsByWeek={cashEventsByWeek}
                expandedWeeks={expandedCashWeeks}
              />
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
  cashImpactByRowWeek,
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
  cashImpactByRowWeek: Map<string, number>;
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
            const applies = lineItemAppliesToWeek(item, weekIndex, week.start, week.end, month, weeks.length) || hasWeekAmount(amounts, item, weekIndex);
            const planned = amountForWeek(amounts, item, weekIndex);
            const actual = (spendLogsByItemWeek.get(stateKey(item.id, weekIndex)) ?? []).reduce((sum, entry) => sum + entry.amount, 0);
            const remaining = Math.max(0, planned - actual);
            const state = dockStatesByItemWeek.get(stateKey(item.id, weekIndex));
            const paid = state?.status === "cleared";
            const skipped = state?.status === "skipped";
            const cashValue = cashImpactByRowWeek.get(cashEventMapKey(item.id, weekIndex)) ?? 0;
            const showCell = viewMode === "budget" ? applies : applies || cashValue !== 0;
            return (
              <td key={weekIndex} className={`px-3 py-3 text-center align-top ${paid ? "bg-harbor-green/5" : skipped ? "bg-slate-50" : ""}`}>
                {showCell ? (
                  <div className="space-y-1">
                    {viewMode === "budget" ? (
                      <>
                        <MoneyInput value={planned} onChange={(value) => updatePlannedAmount(item.id, weekIndex, value)} onBlur={saveMonthlyAmounts} />
                        <div className="text-[11px] text-harbor-navy/50">Actual {formatMoney(actual)} / Left {formatMoney(remaining)}</div>
                      </>
                    ) : (
                      <>
                        <div className={`font-bold ${cashValue < 0 ? "text-harbor-red" : cashValue > 0 ? "text-harbor-green" : "text-slate-400"}`}>{cashValue !== 0 ? formatMoney(cashValue) : "$0.00"}</div>
                        <div className="text-[11px] text-harbor-navy/50">{isCardMethod(item.paymentMethod) ? "No direct checking impact" : paid ? "Paid" : skipped ? "Skipped" : "Checking cash outflow"}</div>
                      </>
                    )}
                    {viewMode === "budget" && !isCardMethod(item.paymentMethod) && planned > 0 && (
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

function WeekDrillDownToggleRow({
  weeks,
  expandedWeeks,
  onToggle,
}: {
  weeks: { start: Date; end: Date; label: string }[];
  expandedWeeks: Record<number, boolean>;
  onToggle: (weekIndex: number) => void;
}) {
  return (
    <tr className="border-b border-slate-100 bg-white">
      <td className="sticky left-0 z-10 border-r border-slate-100 bg-white px-3 py-3 font-semibold" colSpan={2}>Week Drill-Down</td>
      {weeks.map((week, index) => (
        <td key={index} className="px-3 py-3 text-center">
          <button
            type="button"
            onClick={() => onToggle(index)}
            className="rounded-md border border-harbor-teal-light px-2 py-1 text-xs font-semibold text-harbor-teal hover:bg-harbor-teal-light/60"
            aria-expanded={Boolean(expandedWeeks[index])}
          >
            {expandedWeeks[index] ? "Hide" : "Show"}
          </button>
          <div className="mt-1 text-[11px] text-harbor-navy/45">{formatShortDate(week.start)}-{formatShortDate(week.end)}</div>
        </td>
      ))}
    </tr>
  );
}

function WeekDrillDownRows({
  weeks,
  weeklyCash,
  cashEventsByWeek,
  expandedWeeks,
}: {
  weeks: { start: Date; end: Date; label: string }[];
  weeklyCash: WeeklyCash[];
  cashEventsByWeek: Map<number, CashEvent[]>;
  expandedWeeks: Record<number, boolean>;
}) {
  return (
    <>
      {weeks.map((week, weekIndex) => {
        if (!expandedWeeks[weekIndex]) return null;

        const summary = weeklyCash[weekIndex];
        const events = cashEventsByWeek.get(weekIndex) ?? [];
        let running = summary?.starting ?? 0;

        return (
          <tr key={`cash-drilldown-${weekIndex}`} className="border-b border-harbor-teal-light bg-harbor-offwhite/70">
            <td colSpan={2 + weeks.length} className="px-4 py-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-bold text-harbor-navy">Week {weekIndex + 1}: {week.label}</div>
                  <div className="text-xs text-harbor-navy/55">
                    Starts {formatMoney(summary?.starting ?? 0)} · Lowest {formatMoney(summary?.lowest ?? 0)} on {summary ? formatShortDate(summary.lowestDate) : formatShortDate(week.start)} · Ends {formatMoney(summary?.ending ?? 0)}
                  </div>
                </div>
              </div>
              {events.length === 0 ? (
                <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-harbor-navy/55">No cash events this week.</div>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase tracking-wide text-harbor-navy/45">
                        <th className="px-3 py-2">Date</th>
                        <th className="px-3 py-2">Type</th>
                        <th className="px-3 py-2">Event</th>
                        <th className="px-3 py-2 text-right">Impact</th>
                        <th className="px-3 py-2 text-right">Checking</th>
                      </tr>
                    </thead>
                    <tbody>
                      {events.map((event) => {
                        const impact = cashEventImpact(event);
                        running += impact;
                        return (
                          <tr key={event.id} className="border-b border-slate-100 last:border-0">
                            <td className="px-3 py-2 font-medium text-harbor-navy">{formatShortDate(event.date)}</td>
                            <td className="px-3 py-2 text-harbor-navy/60">{cashEventKindLabel(event.kind)}</td>
                            <td className="px-3 py-2 text-harbor-navy">{event.label}</td>
                            <td className={`px-3 py-2 text-right font-semibold ${impact >= 0 ? "text-harbor-green" : "text-harbor-red"}`}>{formatMoney(impact)}</td>
                            <td className="px-3 py-2 text-right font-semibold text-harbor-navy">{formatMoney(running)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </td>
          </tr>
        );
      })}
    </>
  );
}
