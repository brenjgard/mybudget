import type { Buoy } from "./local-repo";
import { getItemBehavior, getRipplePlanType } from "./ripple-type";
import { lineItemAppliesToWeek, lineItemOccurrenceDatesForWeek } from "./schedule";
import type { AppSettings, CreditCardAccount, DockItemState, LineItem, PaymentMethod, SpendLogEntry } from "./types";

export type HarborWeek = {
  start: Date;
  end: Date;
  label: string;
};

export type HarborCashEventKind = "income" | "checkingPayment" | "cardPayment" | "transfer";

export type HarborCashEvent = {
  id: string;
  date: Date;
  label: string;
  amount: number;
  kind: HarborCashEventKind;
  status: "upcoming" | "done";
  sourceMonthKey: string;
  itemId: string;
  itemKind: DockItemState["itemKind"];
  weekIndex: number;
  cardId?: PaymentMethod;
  chart?: string;
  sourceLabel?: string;
  state?: DockItemState;
};

export type HarborDockDay = {
  date: Date;
  events: HarborCashEvent[];
  ending: number;
};

export type HarborWeekForecast = {
  week: HarborWeek;
  starting: number;
  inflows: number;
  outflows: number;
  ending: number;
  lowest: number;
  lowestDate: Date;
  events: HarborCashEvent[];
  days: HarborDockDay[];
};

export type HarborProjectionPoint = {
  date: Date;
  balance: number;
  event?: HarborCashEvent;
};

export type HarborBudgetGroup = {
  category: string;
  budgeted: number;
  spent: number;
  remaining: number;
  weeklyItems: HarborBudgetItem[];
  monthlyItems: HarborBudgetItem[];
};

export type HarborBudgetItem = {
  item: LineItem;
  budgeted: number;
  spent: number;
  remaining: number;
  cadence: "weekly" | "monthly";
};

export type HarborCardObligation = {
  card: CreditCardAccount;
  cycleStart: Date;
  cycleEnd: Date;
  dueDate: Date;
  anchorAmount: number;
  newSpending: number;
  allocatedClosedObligations: number;
  amount: number;
  scheduled: number;
  remaining: number;
  payments: HarborCashEvent[];
};

export function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

export function formatShortDate(date: Date) {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function formatDateRange(start: Date, end: Date) {
  return `${formatShortDate(start)}-${formatShortDate(end)}`;
}

export function isoDate(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

export function monthKeyFor(year: number, month: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

export function monthPartsFromKey(value: string) {
  const [year, month] = value.split("-").map(Number);
  return { year, month: month - 1 };
}

export function addMonths(year: number, month: number, delta: number) {
  const date = new Date(year, month + delta, 1);
  return { year: date.getFullYear(), month: date.getMonth(), monthKey: monthKeyFor(date.getFullYear(), date.getMonth()) };
}

export function parseDateOnly(value?: string) {
  if (!value) return null;
  const [datePart] = value.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

export function getCalendarWeeksForMonth(year: number, month: number): HarborWeek[] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const firstWeekStart = new Date(firstDay);
  firstWeekStart.setDate(firstDay.getDate() - firstDay.getDay());

  const weeks: HarborWeek[] = [];
  for (const start = new Date(firstWeekStart); start <= lastDay; start.setDate(start.getDate() + 7)) {
    const weekStart = new Date(start);
    const weekEnd = new Date(start);
    weekEnd.setDate(weekEnd.getDate() + 6);
    weeks.push({ start: weekStart, end: weekEnd, label: formatDateRange(weekStart, weekEnd) });
  }
  return weeks;
}

export function getCalendarWeeksForRange(startDate: Date, weekCount: number): HarborWeek[] {
  const firstWeekStart = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  firstWeekStart.setDate(firstWeekStart.getDate() - firstWeekStart.getDay());

  return Array.from({ length: weekCount }, (_, index) => {
    const start = new Date(firstWeekStart);
    start.setDate(firstWeekStart.getDate() + index * 7);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { start, end, label: formatDateRange(start, end) };
  });
}

export function weekIndexForDate(weeks: HarborWeek[], date: Date) {
  return weeks.findIndex((week) => date >= week.start && date <= week.end);
}

export function isCardMethod(method: PaymentMethod) {
  return method !== "checking";
}

export function paymentMethodLabel(method: PaymentMethod, settings: AppSettings) {
  if (method === "checking") return "Checking";
  return settings.creditCards.find((card) => card.id === method)?.label ?? "Credit card";
}

export function amountForWeek(amounts: Record<string, Record<number, number>>, item: LineItem, weekIndex: number) {
  return Number(amounts[item.id]?.[weekIndex] ?? 0);
}

export function hasWeekAmount(amounts: Record<string, Record<number, number>>, item: LineItem, weekIndex: number) {
  return amounts[item.id]?.[weekIndex] !== undefined;
}

export function budgetedForItemWeek(amounts: Record<string, Record<number, number>>, item: LineItem, week: HarborWeek, weekIndex: number, month: number, totalWeeks: number, year?: number) {
  const planType = getRipplePlanType(item);
  if (planType === "weekly_allowance") {
    const applies = item.recurrence
      ? lineItemAppliesToWeek(item, weekIndex, week.start, week.end, month, totalWeeks) || hasWeekAmount(amounts, item, weekIndex)
      : true;
    return applies ? amountForWeek(amounts, item, weekIndex) || item.defaultAmount : 0;
  }
  if (planType === "monthly_allowance") {
    const oneTimeDate = parseDateOnly(item.oneTimeDate);
    if (oneTimeDate && (oneTimeDate.getMonth() !== month || (year !== undefined && oneTimeDate.getFullYear() !== year))) return 0;
    if (item.waveType === "oneTime") return weekIndexForDate([week], oneTimeDate ?? week.start) === 0 ? item.defaultAmount : 0;
    const applies = lineItemAppliesToWeek(item, weekIndex, week.start, week.end, month, totalWeeks) || hasWeekAmount(amounts, item, weekIndex);
    return applies ? amountForWeek(amounts, item, weekIndex) || item.defaultAmount : 0;
  }

  const applies = lineItemAppliesToWeek(item, weekIndex, week.start, week.end, month, totalWeeks) || hasWeekAmount(amounts, item, weekIndex);
  return applies ? amountForWeek(amounts, item, weekIndex) : 0;
}

export function stateKey(itemId: string, weekIndex: number) {
  return `${itemId}-${weekIndex}`;
}

function lastDayOfMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function dateForMonthDay(year: number, month: number, day: number) {
  return new Date(year, month, Math.min(day, lastDayOfMonth(year, month)));
}

function projectedPaymentDateForCycleEnd(card: CreditCardAccount, cycleEnd: Date) {
  const dueDay = card.paymentDueDay;
  if (!dueDay) return null;

  const dueMonthOffset = dueDay <= (card.statementClosingDay ?? 31) ? 1 : 0;
  const dueMonth = addMonths(cycleEnd.getFullYear(), cycleEnd.getMonth(), dueMonthOffset);

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

export function cardCycleForDate(card: CreditCardAccount, date: Date) {
  const closeDay = card.statementClosingDay ?? lastDayOfMonth(date.getFullYear(), date.getMonth());
  const cycleEndMonth = date.getDate() <= closeDay
    ? { year: date.getFullYear(), month: date.getMonth() }
    : addMonths(date.getFullYear(), date.getMonth(), 1);
  const cycleEnd = dateForMonthDay(cycleEndMonth.year, cycleEndMonth.month, closeDay);
  const previousCycleEndMonth = addMonths(cycleEndMonth.year, cycleEndMonth.month, -1);
  const previousCycleEnd = dateForMonthDay(previousCycleEndMonth.year, previousCycleEndMonth.month, closeDay);
  const cycleStart = new Date(previousCycleEnd);
  cycleStart.setDate(cycleStart.getDate() + 1);
  const dueDate = projectedPaymentDateForCycleEnd(card, cycleEnd) ?? cycleEnd;
  return { cycleStart, cycleEnd, dueDate };
}

function cashDatesForCheckingItem(item: LineItem, state: DockItemState | undefined, weekIndex: number, week: HarborWeek, month: number, totalWeeks: number) {
  const doneDate = state?.status === "cleared" ? parseDateOnly(state.clearedAt) : null;
  if (doneDate) return [doneDate];

  const scheduledDate = parseDateOnly(state?.pendingUntil);
  if (scheduledDate) return [scheduledDate];

  const preferredDate = parseDateOnly(item.preferredPaymentDate);
  if (preferredDate) return [preferredDate];

  const dueDate = parseDateOnly(item.paymentDueDate);
  if (dueDate) return [dueDate];

  return lineItemOccurrenceDatesForWeek(item, weekIndex, week.start, week.end, month, totalWeeks);
}

function cashEventImpact(event: HarborCashEvent) {
  return event.kind === "income" ? event.amount : -event.amount;
}

function eventSortValue(event: HarborCashEvent) {
  return event.kind === "income" ? 0 : 1;
}

function scheduledCardIdFromState(state: DockItemState, cards: CreditCardAccount[]) {
  const [, cardId] = state.itemId.match(/^(?:scheduled-card-payment|opening-card-payment):([^:]+):/) ?? [];
  if (cardId) return cardId as PaymentMethod;

  const note = state.note?.trim().toLowerCase() ?? "";
  return cards.find((card) => note.includes(card.label.trim().toLowerCase()))?.id;
}

function dateIsInMonth(date: Date, year: number, month: number) {
  return date.getFullYear() === year && date.getMonth() === month;
}

function cardBudgetForecastByDueDate({
  settings,
  weeks,
  month,
  amounts,
  spendLogs,
  dockStates,
}: {
  settings: AppSettings;
  weeks: HarborWeek[];
  month: number;
  amounts: Record<string, Record<number, number>>;
  spendLogs: SpendLogEntry[];
  dockStates: DockItemState[];
}) {
  const stateByItemWeek = new Map<string, DockItemState>();
  dockStates.forEach((state) => stateByItemWeek.set(stateKey(state.itemId, state.weekIndex), state));

  const actualByItemWeekDueDate = spendLogs
    .filter((entry) => isCardMethod(entry.paymentMethod))
    .reduce<Record<string, number>>((totals, entry) => {
      const card = settings.creditCards.find((candidate) => candidate.id === entry.paymentMethod);
      const purchaseDate = parseDateOnly(entry.date);
      if (!card || !purchaseDate) return totals;
      const dueDate = cardCycleForDate(card, purchaseDate).dueDate;
      const key = `${entry.rippleId}:${entry.weekIndex}:${card.id}:${isoDate(dueDate)}`;
      return { ...totals, [key]: (totals[key] ?? 0) + entry.amount };
    }, {});

  return settings.lineItems.reduce<Record<string, number>>((totals, item) => {
    if (item.isIncome || getItemBehavior(item) === "credit_card_payment" || !isCardMethod(item.paymentMethod)) return totals;

    const card = settings.creditCards.find((candidate) => candidate.id === item.paymentMethod);
    if (!card) return totals;
    const anchorDate = parseDateOnly(card.currentBalanceUpdatedAt);

    weeks.forEach((week, weekIndex) => {
      const state = stateByItemWeek.get(stateKey(item.id, weekIndex));
      if (state?.status === "skipped") return;

      const stateAmount = Number(state?.actualAmount ?? state?.plannedAmount ?? 0);
      const planned = stateAmount
        || budgetedForItemWeek(amounts, item, week, weekIndex, month, weeks.length, week.start.getFullYear())
        || item.defaultAmount;
      if (planned <= 0 && stateAmount <= 0) return;

      lineItemOccurrenceDatesForWeek(item, weekIndex, week.start, week.end, month, weeks.length).forEach((occurrenceDate) => {
        if (anchorDate && occurrenceDate <= anchorDate) return;

        const cycle = cardCycleForDate(card, occurrenceDate);
        if (occurrenceDate < cycle.cycleStart || occurrenceDate > cycle.cycleEnd) return;

        const dueDateKey = isoDate(cycle.dueDate);
        const itemWeekDueKey = `${item.id}:${weekIndex}:${card.id}:${dueDateKey}`;
        const actualForOccurrence = actualByItemWeekDueDate[itemWeekDueKey] ?? 0;
        const remainingForecast = Math.max(planned - actualForOccurrence, 0);
        if (remainingForecast <= 0) return;

        const cardDueKey = `${card.id}:${dueDateKey}`;
        totals[cardDueKey] = (totals[cardDueKey] ?? 0) + remainingForecast;
      });
    });

    return totals;
  }, {});
}

function buildScheduledCardPaymentEvents({
  settings,
  monthKey,
  weeks,
  month,
  amounts,
  spendLogs,
  cardSpendLogs = spendLogs,
  dockStates,
  cardPaymentStates = dockStates,
}: {
  settings: AppSettings;
  monthKey: string;
  weeks: HarborWeek[];
  month: number;
  amounts: Record<string, Record<number, number>>;
  spendLogs: SpendLogEntry[];
  cardSpendLogs?: SpendLogEntry[];
  dockStates: DockItemState[];
  cardPaymentStates?: DockItemState[];
}) {
  const sourceMonth = monthPartsFromKey(monthKey);
  const paymentEventFromState = (state: DockItemState) => {
    const date = parseDateOnly(state.pendingUntil);
    const amount = Number(state.actualAmount ?? state.plannedAmount ?? 0);
    return date && amount > 0 ? {
      id: state.itemId,
      date,
      label: state.note || "Card payment",
      amount,
      kind: "cardPayment" as const,
      status: state.status === "cleared" ? "done" as const : "upcoming" as const,
      sourceMonthKey: state.monthKey,
      itemId: state.itemId,
      itemKind: "credit_card_payment" as const,
      weekIndex: state.weekIndex,
      state,
      cardId: scheduledCardIdFromState(state, settings.creditCards),
      chart: "Credit Card",
      sourceLabel: "Checking",
    } : null;
  };
  const allManualPayments = cardPaymentStates
    .filter((state) => state.itemKind === "credit_card_payment" && (
      state.itemId.startsWith("scheduled-card-payment:")
      || state.itemId.startsWith("opening-card-payment:")
    ))
    .map(paymentEventFromState)
    .filter((event): event is NonNullable<typeof event> => Boolean(event));
  const manualPayments = dockStates
    .filter((state) => state.itemKind === "credit_card_payment" && (
      state.itemId.startsWith("scheduled-card-payment:")
      || state.itemId.startsWith("opening-card-payment:")
    ))
    .map(paymentEventFromState)
    .filter((event): event is NonNullable<typeof event> => Boolean(event));

  const cardSpendByCardDueDate = cardSpendLogs
    .filter((entry) => isCardMethod(entry.paymentMethod))
    .reduce<Record<string, number>>((totals, entry) => {
      const card = settings.creditCards.find((candidate) => candidate.id === entry.paymentMethod);
      const purchaseDate = parseDateOnly(entry.date);
      if (!card || !purchaseDate) return totals;
      if (!dateIsInMonth(purchaseDate, sourceMonth.year, sourceMonth.month)) return totals;
      const anchorDate = parseDateOnly(card.currentBalanceUpdatedAt);
      if (anchorDate && purchaseDate < anchorDate) return totals;
      const dueDate = cardCycleForDate(card, purchaseDate).dueDate;
      const key = `${card.id}:${isoDate(dueDate)}`;
      return { ...totals, [key]: (totals[key] ?? 0) + entry.amount };
    }, {});
  const cardBudgetForecastByCardDueDate = cardBudgetForecastByDueDate({
    settings,
    weeks,
    month,
    amounts,
    spendLogs: cardSpendLogs,
    dockStates,
  });

  const projectedPayments = settings.creditCards.flatMap((card) => {
    const anchorDate = parseDateOnly(card.currentBalanceUpdatedAt);
    const anchorCycle = anchorDate ? cardCycleForDate(card, anchorDate) : null;
    const allocatedClosedObligations = allManualPayments
      .filter((event) => event.status !== "done" && event.cardId === card.id)
      .filter((event) => anchorCycle ? event.date <= anchorCycle.dueDate : true)
      .reduce((sum, event) => sum + event.amount, 0);
    const activeAnchorAmount = Math.max(0, Number(card.currentBalance ?? 0) - allocatedClosedObligations);
    const projectedEntries = new Map<string, { date: Date; amount: number }>();

    if (anchorCycle && activeAnchorAmount > 0 && dateIsInMonth(anchorCycle.cycleEnd, sourceMonth.year, sourceMonth.month)) {
      projectedEntries.set(isoDate(anchorCycle.dueDate), { date: anchorCycle.dueDate, amount: activeAnchorAmount });
    }

    Object.entries(cardSpendByCardDueDate)
      .filter(([key]) => key.startsWith(`${card.id}:`))
      .forEach(([key, amount]) => {
        const date = parseDateOnly(key.split(":").at(-1));
        if (!date || amount <= 0) return;
        const existing = projectedEntries.get(isoDate(date));
        projectedEntries.set(isoDate(date), { date, amount: (existing?.amount ?? 0) + amount });
      });

    Object.entries(cardBudgetForecastByCardDueDate)
      .filter(([key]) => key.startsWith(`${card.id}:`))
      .forEach(([key, amount]) => {
        const date = parseDateOnly(key.split(":").at(-1));
        if (!date || amount <= 0) return;
        const existing = projectedEntries.get(isoDate(date));
        projectedEntries.set(isoDate(date), { date, amount: (existing?.amount ?? 0) + amount });
      });

    return [...projectedEntries.values()].flatMap(({ date, amount }) => {
      const projectedId = `projected-card-payment:${card.id}:${isoDate(date)}`;
      const projectedState = dockStates.find((state) => state.itemId === projectedId && state.itemKind === "credit_card_payment");
      return [{
        id: projectedId,
        date,
        label: `${card.label} payment`,
        amount,
        kind: "cardPayment" as const,
        status: projectedState?.status === "cleared" ? "done" as const : "upcoming" as const,
        sourceMonthKey: monthKey,
        itemId: projectedId,
        itemKind: "credit_card_payment" as const,
        weekIndex: 0,
        state: projectedState,
        cardId: card.id,
        chart: "Credit Card",
        sourceLabel: "Checking",
      }];
    });
  });

  return [...manualPayments, ...projectedPayments];
}

export function buildCurrentForwardBudgetSummary({
  settings,
  weeks,
  month,
  year,
  amounts,
  spendLogs,
  today = new Date(),
}: {
  settings: AppSettings;
  weeks: HarborWeek[];
  month: number;
  year: number;
  amounts: Record<string, Record<number, number>>;
  spendLogs: SpendLogEntry[];
  today?: Date;
}) {
  const currentWeekIndex = weekIndexForDate(weeks, today);
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0);
  const actionableWeekIndexes = weeks
    .map((_, index) => index)
    .filter((index) => {
      if (currentWeekIndex >= 0) return index >= currentWeekIndex;
      return monthStart > today;
    });
  const historicalWeekIndexes = weeks
    .map((_, index) => index)
    .filter((index) => {
      if (currentWeekIndex >= 0) return index < currentWeekIndex;
      return monthEnd < today;
    });

  const spendingItems = settings.lineItems.filter((item) => !item.isIncome && getItemBehavior(item) !== "credit_card_payment");
  const incomeItems = settings.lineItems.filter((item) => item.isIncome);

  const budgetedForIndexes = (items: LineItem[], indexes: number[]) => indexes.reduce((sum, weekIndex) => {
    const week = weeks[weekIndex];
    if (!week) return sum;
    return sum + items.reduce((itemSum, item) => (
      itemSum + budgetedForItemWeek(amounts, item, week, weekIndex, month, weeks.length, year)
    ), 0);
  }, 0);

  const spentInIndexes = (indexes: number[]) => spendLogs
    .filter((entry) => indexes.includes(entry.weekIndex))
    .reduce((sum, entry) => sum + entry.amount, 0);

  const plannedSpending = budgetedForIndexes(spendingItems, weeks.map((_, index) => index));
  const spentSoFar = spendLogs.reduce((sum, entry) => sum + entry.amount, 0);
  const remainingPlannedSpending = budgetedForIndexes(spendingItems, actionableWeekIndexes);
  const remainingExpectedIncome = budgetedForIndexes(incomeItems, actionableWeekIndexes);
  const historicalBudgeted = budgetedForIndexes(spendingItems, historicalWeekIndexes);
  const historicalSpent = spentInIndexes(historicalWeekIndexes);
  const thisWeekBudgeted = currentWeekIndex >= 0 ? budgetedForIndexes(spendingItems, [currentWeekIndex]) : 0;
  const thisWeekSpent = currentWeekIndex >= 0 ? spentInIndexes([currentWeekIndex]) : 0;
  const forwardSpent = spentInIndexes(actionableWeekIndexes);

  return {
    currentWeekIndex,
    earlierWeekCount: historicalWeekIndexes.length,
    thisWeek: {
      budgeted: thisWeekBudgeted,
      spent: thisWeekSpent,
      remaining: thisWeekBudgeted - thisWeekSpent,
    },
    restOfMonth: {
      remainingPlannedSpending,
      spent: forwardSpent,
      remainingExpectedIncome,
      availablePosition: remainingPlannedSpending - forwardSpent,
    },
    monthPosition: {
      plannedSpending,
      spentSoFar,
      historicalBudgeted,
      historicalSpent,
      remainingPlannedSpending,
      recordedRemaining: plannedSpending - spentSoFar,
    },
  };
}

export function buildBudgetGroups({
  settings,
  weeks,
  month,
  year,
  amounts,
  spendLogs,
}: {
  settings: AppSettings;
  weeks: HarborWeek[];
  month: number;
  year?: number;
  amounts: Record<string, Record<number, number>>;
  spendLogs: SpendLogEntry[];
}) {
  const spendByItem = spendLogs.reduce<Record<string, number>>((totals, entry) => ({
    ...totals,
    [entry.rippleId]: (totals[entry.rippleId] ?? 0) + entry.amount,
  }), {});

  const items = settings.lineItems
    .filter((item) => !item.isIncome && getItemBehavior(item) !== "credit_card_payment")
    .map<HarborBudgetItem>((item) => {
      const budgeted = weeks.reduce((sum, week, weekIndex) => {
        return sum + budgetedForItemWeek(amounts, item, week, weekIndex, month, weeks.length, year);
      }, 0);
      const spent = spendByItem[item.id] ?? 0;
      const planType = getRipplePlanType(item);
      const monthlyCadence = planType === "monthly_allowance" || item.waveType === "oneTime" || item.recurrence?.type === "monthly" || item.recurrence?.unit === "months";
      return { item, budgeted, spent, remaining: budgeted - spent, cadence: monthlyCadence ? "monthly" : "weekly" };
    });

  return items.reduce<HarborBudgetGroup[]>((groups, budgetItem) => {
    const existing = groups.find((group) => group.category === budgetItem.item.category);
    const group = existing ?? {
      category: budgetItem.item.category,
      budgeted: 0,
      spent: 0,
      remaining: 0,
      weeklyItems: [],
      monthlyItems: [],
    };
    group.budgeted += budgetItem.budgeted;
    group.spent += budgetItem.spent;
    group.remaining = group.budgeted - group.spent;
    if (budgetItem.cadence === "weekly") group.weeklyItems.push(budgetItem);
    else group.monthlyItems.push(budgetItem);
    return existing ? groups : [...groups, group];
  }, []);
}

export function buildCashEvents({
  settings,
  weeks,
  month,
  monthKey,
  amounts,
  spendLogs,
  cardSpendLogs,
  dockStates,
  cardPaymentStates,
  buoys,
}: {
  settings: AppSettings;
  weeks: HarborWeek[];
  month: number;
  monthKey: string;
  amounts: Record<string, Record<number, number>>;
  spendLogs: SpendLogEntry[];
  cardSpendLogs?: SpendLogEntry[];
  dockStates: DockItemState[];
  cardPaymentStates?: DockItemState[];
  buoys: Buoy[];
}) {
  const stateByItemWeek = new Map<string, DockItemState>();
  dockStates.forEach((state) => stateByItemWeek.set(stateKey(state.itemId, state.weekIndex), state));

  const spendByItemWeek = new Map<string, SpendLogEntry[]>();
  spendLogs.forEach((entry) => {
    const key = stateKey(entry.rippleId, entry.weekIndex);
    spendByItemWeek.set(key, [...(spendByItemWeek.get(key) ?? []), entry]);
  });

  const events: HarborCashEvent[] = [];
  const addEvent = (event: HarborCashEvent) => events.push(event);

  weeks.forEach((week, weekIndex) => {
    settings.lineItems.forEach((item) => {
      if (getItemBehavior(item) === "credit_card_payment") return;
      const planType = getRipplePlanType(item);
      if (!item.isIncome && planType !== "scheduled_expense") {
        const actualCheckingEntries = spendByItemWeek.get(stateKey(item.id, weekIndex))?.filter((entry) => entry.paymentMethod === "checking") ?? [];
        if (actualCheckingEntries.length > 0) {
          actualCheckingEntries.forEach((entry) => {
            const date = parseDateOnly(entry.date);
            if (!date) return;
            addEvent({
              id: `${monthKey}:${entry.id}:checking`,
              date,
              label: entry.note?.trim() || item.name,
              amount: entry.amount,
              kind: "checkingPayment",
              status: "done",
              sourceMonthKey: monthKey,
              itemId: item.id,
              itemKind: "ripple",
              weekIndex,
              chart: item.category,
              sourceLabel: "Checking",
            });
          });
          return;
        }
        if (item.includeInCashForecast && !isCardMethod(item.paymentMethod)) {
          const applies = lineItemAppliesToWeek(item, weekIndex, week.start, week.end, month, weeks.length) || hasWeekAmount(amounts, item, weekIndex);
          const state = stateByItemWeek.get(stateKey(item.id, weekIndex));
          const amount = Number(state?.actualAmount ?? amountForWeek(amounts, item, weekIndex));
          if (!applies || state?.status === "skipped" || amount <= 0) return;
          cashDatesForCheckingItem(item, state, weekIndex, week, month, weeks.length).forEach((date) => addEvent({
            id: `${monthKey}:${item.id}:${weekIndex}:${isoDate(date)}:checking-allowance`,
            date,
            label: item.name,
            amount,
            kind: "checkingPayment",
            status: state?.status === "cleared" ? "done" : "upcoming",
            sourceMonthKey: monthKey,
            itemId: item.id,
            itemKind: "ripple",
            weekIndex,
            state,
            chart: item.category,
            sourceLabel: "Checking",
          }));
        }
        return;
      }
      const applies = lineItemAppliesToWeek(item, weekIndex, week.start, week.end, month, weeks.length) || hasWeekAmount(amounts, item, weekIndex);
      if (!applies) return;
      const state = stateByItemWeek.get(stateKey(item.id, weekIndex));
      if (state?.status === "skipped") return;
      const amount = Number(state?.actualAmount ?? amountForWeek(amounts, item, weekIndex));
      if (amount <= 0) return;

      if (item.isIncome) {
        lineItemOccurrenceDatesForWeek(item, weekIndex, week.start, week.end, month, weeks.length).forEach((date) => addEvent({
          id: `${monthKey}:${item.id}:${weekIndex}:${isoDate(date)}:income`,
          date,
          label: item.name,
          amount,
          kind: "income",
          status: state?.status === "cleared" ? "done" : "upcoming",
          sourceMonthKey: monthKey,
          itemId: item.id,
          itemKind: "wave",
          weekIndex,
          state,
          chart: item.category,
          sourceLabel: "Checking",
        }));
        return;
      }

      if (isCardMethod(item.paymentMethod)) return;

      const actualCheckingEntries = spendByItemWeek.get(stateKey(item.id, weekIndex))?.filter((entry) => entry.paymentMethod === "checking") ?? [];
      if (actualCheckingEntries.length > 0) {
        actualCheckingEntries.forEach((entry) => {
          const date = parseDateOnly(entry.date);
          if (!date) return;
          addEvent({
            id: `${monthKey}:${entry.id}:checking`,
            date,
            label: entry.note?.trim() || item.name,
            amount: entry.amount,
            kind: "checkingPayment",
            status: "done",
            sourceMonthKey: monthKey,
            itemId: item.id,
            itemKind: "ripple",
            weekIndex,
            state,
            chart: item.category,
            sourceLabel: "Checking",
          });
        });
        return;
      }

      cashDatesForCheckingItem(item, state, weekIndex, week, month, weeks.length).forEach((date) => addEvent({
        id: `${monthKey}:${item.id}:${weekIndex}:${isoDate(date)}:checking`,
        date,
        label: item.name,
        amount,
        kind: "checkingPayment",
        status: state?.status === "cleared" ? "done" : "upcoming",
        sourceMonthKey: monthKey,
        itemId: item.id,
        itemKind: "ripple",
        weekIndex,
        state,
        chart: item.category,
        sourceLabel: "Checking",
      }));
    });
  });

  dockStates
    .filter((state) => state.itemId.startsWith("one-time-cash:") || state.itemId.startsWith("one-time-income:"))
    .forEach((state) => {
      const date = parseDateOnly(state.pendingUntil);
      const amount = Number(state.actualAmount ?? state.plannedAmount ?? 0);
      if (!date || amount <= 0 || state.status === "skipped") return;
      const income = state.itemId.startsWith("one-time-income:");
      addEvent({
        id: state.itemId,
        date,
        label: state.note || (income ? "One-time income" : "One-time cash item"),
        amount,
        kind: income ? "income" : "checkingPayment",
        status: state.status === "cleared" ? "done" : "upcoming",
        sourceMonthKey: monthKey,
        itemId: state.itemId,
        itemKind: income ? "wave" : "ripple",
        weekIndex: state.weekIndex,
        state,
        chart: income ? "Income" : "Cash",
        sourceLabel: "Checking",
      });
    });

  buildScheduledCardPaymentEvents({ settings, monthKey, weeks, month, amounts, spendLogs, cardSpendLogs, dockStates, cardPaymentStates }).forEach(addEvent);

  buoys.forEach((buoy) => {
    const amount = buoy.autoSave ?? 0;
    if (amount <= 0 || !buoy.autoSaveDay) return;
    const sourceMonth = monthPartsFromKey(monthKey);
    const date = dateForMonthDay(sourceMonth.year, sourceMonth.month, buoy.autoSaveDay);
    addEvent({
      id: `${monthKey}:${buoy.id}:transfer`,
      date,
      label: `${buoy.name} transfer`,
      amount,
      kind: "transfer",
      status: "upcoming",
      sourceMonthKey: monthKey,
      itemId: `transfer:${buoy.id}`,
      itemKind: "ripple",
      weekIndex: weekIndexForDate(weeks, date),
      chart: "Buoy",
      sourceLabel: "Checking",
    });
  });

  return events.sort((a, b) => (
    a.date.getTime() - b.date.getTime()
    || eventSortValue(a) - eventSortValue(b)
    || a.label.localeCompare(b.label)
  ));
}

export function buildDockForecast(events: HarborCashEvent[], startingChecking: number, weeks: HarborWeek[]): HarborWeekForecast[] {
  let running = startingChecking;
  const upcomingEvents = events.filter((event) => event.status !== "done");

  return weeks.map((week) => {
    const weekEvents = upcomingEvents.filter((event) => event.date >= week.start && event.date <= week.end);
    const starting = running;
    let inflows = 0;
    let outflows = 0;
    let lowest = running;
    let lowestDate = week.start;
    const days: HarborDockDay[] = [];
    const grouped = new Map<string, HarborCashEvent[]>();
    weekEvents.forEach((event) => grouped.set(isoDate(event.date), [...(grouped.get(isoDate(event.date)) ?? []), event]));

    [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)).forEach(([dateKey, dayEvents]) => {
      dayEvents.sort((a, b) => eventSortValue(a) - eventSortValue(b) || a.label.localeCompare(b.label));
      dayEvents.forEach((event) => {
        const impact = cashEventImpact(event);
        if (impact > 0) inflows += impact;
        else outflows += Math.abs(impact);
        running += impact;
        if (running < lowest) {
          lowest = running;
          lowestDate = event.date;
        }
      });
      days.push({ date: parseDateOnly(dateKey) ?? week.start, events: dayEvents, ending: running });
    });

    return { week, starting, inflows, outflows, ending: running, lowest, lowestDate, events: weekEvents, days };
  });
}

export function buildDockProjection(events: HarborCashEvent[], startingChecking: number, startDate: Date, endDate: Date) {
  let running = startingChecking;
  const points: HarborProjectionPoint[] = [{ date: startDate, balance: running }];
  const upcomingEvents = events
    .filter((event) => event.status !== "done" && event.date >= startDate && event.date <= endDate)
    .sort((a, b) => (
      a.date.getTime() - b.date.getTime()
      || eventSortValue(a) - eventSortValue(b)
      || a.label.localeCompare(b.label)
    ));

  upcomingEvents.forEach((event) => {
    running += cashEventImpact(event);
    points.push({ date: event.date, balance: running, event });
  });

  return points;
}

export function buildCardObligations(settings: AppSettings, monthKey: string, spendLogs: SpendLogEntry[], cashEvents: HarborCashEvent[]): HarborCardObligation[] {
  void monthKey;
  return settings.creditCards.map((card) => {
    const anchorDate = parseDateOnly(card.currentBalanceUpdatedAt) ?? new Date();
    const activeCycle = cardCycleForDate(card, anchorDate);
    const closedObligations = cashEvents
      .filter((event) => event.kind === "cardPayment" && event.status !== "done" && (
        event.itemId.startsWith("scheduled-card-payment:")
        || event.itemId.startsWith("opening-card-payment:")
      ) && (event.cardId === card.id || event.label.toLowerCase().includes(card.label.toLowerCase())))
      .reduce((sum, event) => sum + event.amount, 0);
    const anchorAmount = Math.max(0, Number(card.currentBalance ?? 0) - closedObligations);
    const newSpending = spendLogs
      .filter((entry) => {
        if (entry.paymentMethod !== card.id) return false;
        const date = parseDateOnly(entry.date);
        if (!date) return false;
        return date >= anchorDate && cardCycleForDate(card, date).dueDate.getTime() === activeCycle.dueDate.getTime();
      })
      .reduce((sum, entry) => sum + entry.amount, 0);
    const dueDate = activeCycle.dueDate;
    const payments = cashEvents.filter((event) => event.kind === "cardPayment" && (event.cardId === card.id || event.label.toLowerCase().includes(card.label.toLowerCase())));
    const projectedPayment = payments.find((event) => event.itemId === `projected-card-payment:${card.id}:${isoDate(dueDate)}`);
    const amount = projectedPayment?.amount ?? anchorAmount + newSpending;
    const scheduledByDue = payments
      .filter((event) => event.date > activeCycle.cycleEnd && event.date <= dueDate)
      .reduce((sum, event) => sum + event.amount, 0);
    return {
      card,
      cycleStart: activeCycle.cycleStart,
      cycleEnd: activeCycle.cycleEnd,
      dueDate,
      anchorAmount,
      newSpending,
      allocatedClosedObligations: closedObligations,
      amount,
      scheduled: scheduledByDue,
      remaining: Math.max(0, amount - scheduledByDue),
      payments,
    };
  }).filter((obligation) => obligation.amount > 0 || obligation.payments.length > 0 || Number(obligation.card.currentBalance ?? 0) > 0);
}
