import type {
  ActualTransaction,
  AppSettings,
  BudgetItem,
  CashFlowEvent,
  CreditCardPayment,
  LineItem,
  PaymentAccount,
  PaymentAccountType,
  PaymentMethod,
  Recurrence,
  SpendLogEntry,
} from "./types";

type LegacyAccountLike = {
  id?: string;
  accountKey?: string;
  kind?: "checking" | "credit" | string | null;
  type?: string | null;
  currentBalance?: number;
};

type CategoryForecast = {
  categoryId: string;
  categoryName?: string;
  planned: number;
  actual: number;
  remaining: number;
  overUnder: number;
  defaultPaymentMethods: PaymentAccountType[];
  actualByPaymentMethod: Partial<Record<PaymentAccountType, number>>;
  plannedByPaymentMethod: Partial<Record<PaymentAccountType, number>>;
};

type CashFlowEntry = {
  id: string;
  date: string;
  name: string;
  amount: number;
  direction: "inflow" | "outflow";
  source: "cash_flow_event" | "transaction" | "credit_card_payment" | "planned_budget_item";
  status: CashFlowEvent["status"] | CreditCardPayment["status"] | "cleared";
};

type CashFlowPeriod = {
  key: string;
  label: string;
  startDate: string;
  endDate: string;
  startingCash: number;
  inflows: number;
  cashOutflows: number;
  scheduledCreditCardPayments: number;
  endingCash: number;
  entries: CashFlowEntry[];
};

export type BudgetForecast = {
  startDate: string;
  endDate: string;
  categories: CategoryForecast[];
  totalPlanned: number;
  totalActual: number;
  totalRemaining: number;
};

export type CashFlowForecast = {
  startDate: string;
  endDate: string;
  startingBalance: number;
  inflows: number;
  outflows: number;
  scheduledCreditCardPayments: number;
  creditCardPurchases: number;
  projectedCreditCardLiability: number;
  endingBalance: number;
  entries: CashFlowEntry[];
  weekly: CashFlowPeriod[];
  monthly: CashFlowPeriod[];
};

function isPaymentAccountType(value: string | null | undefined): value is PaymentAccountType {
  return value === "checking" || value === "credit_card" || value === "savings" || value === "cash";
}

export function getPaymentAccountType(account: LegacyAccountLike): PaymentAccountType {
  if (isPaymentAccountType(account.type)) return account.type;
  if (account.kind === "credit") return "credit_card";
  if (account.kind === "checking") return "checking";
  return "checking";
}

function isWithinDateRange(date: string, startDate: string, endDate: string) {
  const normalized = date.slice(0, 10);
  return normalized >= startDate && normalized <= endDate;
}

function uniquePaymentMethods(methods: PaymentAccountType[]) {
  return Array.from(new Set(methods));
}

function addByPaymentMethod(
  current: Partial<Record<PaymentAccountType, number>>,
  method: PaymentAccountType,
  amount: number,
) {
  return {
    ...current,
    [method]: (current[method] ?? 0) + amount,
  };
}

function isoDate(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function parseDate(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day);
}

function buildWeekPeriods(startDate: string, endDate: string) {
  const periods: Omit<CashFlowPeriod, "startingCash" | "inflows" | "cashOutflows" | "scheduledCreditCardPayments" | "endingCash" | "entries">[] = [];
  let current = parseDate(startDate);
  const final = parseDate(endDate);
  let index = 1;

  while (current <= final) {
    const start = new Date(current);
    const end = addDays(start, 6);
    if (end > final) end.setTime(final.getTime());
    periods.push({
      key: `${isoDate(start)}:${isoDate(end)}`,
      label: `Week ${index}`,
      startDate: isoDate(start),
      endDate: isoDate(end),
    });
    current = addDays(end, 1);
    index += 1;
  }

  return periods;
}

function buildMonthPeriods(startDate: string, endDate: string) {
  const periods: Omit<CashFlowPeriod, "startingCash" | "inflows" | "cashOutflows" | "scheduledCreditCardPayments" | "endingCash" | "entries">[] = [];
  let current = new Date(parseDate(startDate).getFullYear(), parseDate(startDate).getMonth(), 1);
  const final = parseDate(endDate);

  while (current <= final) {
    const monthStart = new Date(current);
    const monthEnd = new Date(current.getFullYear(), current.getMonth() + 1, 0);
    const boundedStart = isoDate(monthStart) < startDate ? parseDate(startDate) : monthStart;
    const boundedEnd = monthEnd > final ? final : monthEnd;
    periods.push({
      key: `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, "0")}`,
      label: monthStart.toLocaleDateString("en-US", { month: "short", year: "numeric" }),
      startDate: isoDate(boundedStart),
      endDate: isoDate(boundedEnd),
    });
    current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
  }

  return periods;
}

function bucketEntries(
  entries: CashFlowEntry[],
  periods: Omit<CashFlowPeriod, "startingCash" | "inflows" | "cashOutflows" | "scheduledCreditCardPayments" | "endingCash" | "entries">[],
  startingBalance: number,
): CashFlowPeriod[] {
  let running = startingBalance;

  return periods.map((period) => {
    const periodEntries = entries.filter((entry) => isWithinDateRange(entry.date, period.startDate, period.endDate));
    const inflows = periodEntries
      .filter((entry) => entry.direction === "inflow")
      .reduce((sum, entry) => sum + entry.amount, 0);
    const scheduledCreditCardPayments = periodEntries
      .filter((entry) => entry.source === "credit_card_payment")
      .reduce((sum, entry) => sum + entry.amount, 0);
    const cashOutflows = periodEntries
      .filter((entry) => entry.direction === "outflow" && entry.source !== "credit_card_payment")
      .reduce((sum, entry) => sum + entry.amount, 0);
    const periodStartingCash = running;
    running = running + inflows - cashOutflows - scheduledCreditCardPayments;

    return {
      ...period,
      startingCash: periodStartingCash,
      inflows,
      cashOutflows,
      scheduledCreditCardPayments,
      endingCash: running,
      entries: periodEntries,
    };
  });
}

function plannedDateForBudgetItem(item: BudgetItem, startDate: string, endDate: string) {
  const config = item.recurrenceConfig && typeof item.recurrenceConfig === "object"
    ? item.recurrenceConfig as Record<string, unknown>
    : {};
  const date = [config.date, config.scheduledDate, config.dueDate, config.oneTimeDate]
    .find((value): value is string => typeof value === "string");
  if (date && isWithinDateRange(date, startDate, endDate)) return date.slice(0, 10);

  const days = Array.isArray(config.daysOfMonth) ? config.daysOfMonth : undefined;
  const day = days?.find((value): value is number => typeof value === "number")
    ?? (typeof config.dayOfMonth === "number" ? config.dayOfMonth : undefined);
  if (!day) return null;

  const start = parseDate(startDate);
  const candidate = new Date(start.getFullYear(), start.getMonth(), day);
  const candidateISO = isoDate(candidate);
  return isWithinDateRange(candidateISO, startDate, endDate) ? candidateISO : null;
}

export function buildBudgetForecast({
  budgetItems,
  transactions,
  categories = [],
  startDate,
  endDate,
}: {
  budgetItems: BudgetItem[];
  transactions: ActualTransaction[];
  categories?: { id: string; name: string }[];
  startDate: string;
  endDate: string;
}): BudgetForecast {
  const categoryIds = new Set<string>();
  const categoryNamesById = new Map(categories.map((category) => [category.id, category.name]));
  budgetItems.forEach((item) => {
    if (item.active) categoryIds.add(item.categoryId);
  });
  transactions.forEach((transaction) => {
    if (isWithinDateRange(transaction.date, startDate, endDate)) {
      categoryIds.add(transaction.categoryId);
    }
  });

  const categoryForecasts = Array.from(categoryIds).map<CategoryForecast>((categoryId) => {
    const items = budgetItems.filter((item) => item.active && item.categoryId === categoryId);
    const categoryTransactions = transactions.filter((transaction) => (
      transaction.categoryId === categoryId && isWithinDateRange(transaction.date, startDate, endDate)
    ));
    const planned = items.reduce((sum, item) => sum + item.amount, 0);
    const actual = categoryTransactions.reduce((sum, transaction) => sum + transaction.amount, 0);
    const categoryName = categoryNamesById.get(categoryId) ?? items[0]?.categoryName ?? categoryTransactions[0]?.categoryName;
    const plannedByPaymentMethod = items.reduce<Partial<Record<PaymentAccountType, number>>>(
      (byMethod, item) => addByPaymentMethod(byMethod, item.paymentMethod, item.amount),
      {},
    );
    const actualByPaymentMethod = categoryTransactions.reduce<Partial<Record<PaymentAccountType, number>>>(
      (byMethod, transaction) => addByPaymentMethod(byMethod, transaction.paymentMethod, transaction.amount),
      {},
    );

    return {
      categoryId,
      categoryName,
      planned,
      actual,
      remaining: planned - actual,
      overUnder: actual - planned,
      defaultPaymentMethods: uniquePaymentMethods(items.map((item) => item.paymentMethod)),
      plannedByPaymentMethod,
      actualByPaymentMethod,
    };
  });

  const totalPlanned = categoryForecasts.reduce((sum, category) => sum + category.planned, 0);
  const totalActual = categoryForecasts.reduce((sum, category) => sum + category.actual, 0);

  return {
    startDate,
    endDate,
    categories: categoryForecasts,
    totalPlanned,
    totalActual,
    totalRemaining: totalPlanned - totalActual,
  };
}

export function buildCashFlowForecast({
  startingBalance,
  cashAccountId,
  accounts,
  transactions,
  cashFlowEvents,
  creditCardPayments,
  budgetItems = [],
  startDate,
  endDate,
}: {
  startingBalance: number;
  cashAccountId: string;
  accounts: PaymentAccount[];
  transactions: ActualTransaction[];
  cashFlowEvents: CashFlowEvent[];
  creditCardPayments: CreditCardPayment[];
  budgetItems?: BudgetItem[];
  startDate: string;
  endDate: string;
}): CashFlowForecast {
  const accountsById = new Map(accounts.map((account) => [account.id, account]));
  const linkedPaymentIds = new Set(
    cashFlowEvents
      .map((event) => event.linkedCreditCardPaymentId)
      .filter((id): id is string => Boolean(id)),
  );

  const eventEntries: CashFlowEntry[] = cashFlowEvents
    .filter((event) => (
      event.cashAccountId === cashAccountId
      && event.status !== "skipped"
      && isWithinDateRange(event.date, startDate, endDate)
    ))
    .map((event) => ({
      id: event.id,
      date: event.date,
      name: event.name,
      amount: event.amount,
      direction: event.direction,
      source: "cash_flow_event",
      status: event.status,
    }));

  const transactionEntries: CashFlowEntry[] = transactions
    .filter((transaction) => {
      const account = accountsById.get(transaction.accountId);
      const accountType = account ? getPaymentAccountType(account) : transaction.paymentMethod;
      return (
        (transaction.accountId === cashAccountId || !account)
        && (accountType === "checking" || accountType === "cash")
        && isWithinDateRange(transaction.date, startDate, endDate)
      );
    })
    .map((transaction) => ({
      id: transaction.id,
      date: transaction.date,
      name: transaction.merchant ?? "Transaction",
      amount: transaction.amount,
      direction: "outflow",
      source: "transaction",
      status: "cleared",
    }));

  const paymentEntries: CashFlowEntry[] = creditCardPayments
    .filter((payment) => (
      payment.cashAccountId === cashAccountId
      && payment.status !== "skipped"
      && !linkedPaymentIds.has(payment.id)
      && isWithinDateRange(payment.scheduledDate, startDate, endDate)
    ))
    .map((payment) => ({
      id: payment.id,
      date: payment.scheduledDate,
      name: "Credit card payment",
      amount: payment.amount,
      direction: "outflow",
      source: "credit_card_payment",
      status: payment.status,
    }));

  const plannedBudgetEntries: CashFlowEntry[] = budgetItems
    .filter((item) => item.active && (item.paymentMethod === "checking" || item.paymentMethod === "cash"))
    .flatMap((item) => {
      const date = plannedDateForBudgetItem(item, startDate, endDate);
      if (!date) return [];
      const hasActualCashTransaction = transactions.some((transaction) => (
        transaction.plannedItemId === item.id
        && isWithinDateRange(transaction.date, startDate, endDate)
        && (transaction.paymentMethod === "checking" || transaction.paymentMethod === "cash")
      ));
      if (hasActualCashTransaction) return [];

      return {
        id: item.id,
        date,
        name: item.name,
        amount: item.amount,
        direction: "outflow",
        source: "planned_budget_item",
        status: "scheduled",
      };
    });

  const entries = [...eventEntries, ...transactionEntries, ...paymentEntries, ...plannedBudgetEntries]
    .sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
  const inflows = entries
    .filter((entry) => entry.direction === "inflow")
    .reduce((sum, entry) => sum + entry.amount, 0);
  const outflows = entries
    .filter((entry) => entry.direction === "outflow")
    .reduce((sum, entry) => sum + entry.amount, 0);
  const scheduledCreditCardPayments = paymentEntries.reduce((sum, entry) => sum + entry.amount, 0);
  const creditCardPurchases = transactions
    .filter((transaction) => (
      transaction.paymentMethod === "credit_card"
      && isWithinDateRange(transaction.date, startDate, endDate)
    ))
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const projectedCreditCardLiability = creditCardPurchases - creditCardPayments
    .filter((payment) => payment.status === "paid" && isWithinDateRange(payment.scheduledDate, startDate, endDate))
    .reduce((sum, payment) => sum + payment.amount, 0);
  const weekly = bucketEntries(entries, buildWeekPeriods(startDate, endDate), startingBalance);
  const monthly = bucketEntries(entries, buildMonthPeriods(startDate, endDate), startingBalance);

  return {
    startDate,
    endDate,
    startingBalance,
    inflows,
    outflows,
    scheduledCreditCardPayments,
    creditCardPurchases,
    projectedCreditCardLiability,
    endingBalance: startingBalance + inflows - outflows,
    entries,
    weekly,
    monthly,
  };
}

function paymentMethodToAccountType(paymentMethod: PaymentMethod): PaymentAccountType {
  return paymentMethod === "checking" ? "checking" : "credit_card";
}

function recurrenceTypeForLineItem(item: LineItem) {
  if (item.waveType === "oneTime") return "oneTime";
  return item.recurrence?.type ?? "legacy";
}

function recurrenceConfigForLineItem(item: LineItem): Recurrence | Record<string, unknown> | undefined {
  if (item.recurrence) return item.recurrence;
  return {
    frequency: item.frequency,
    anchorDate: item.anchorDate,
    anchorMonth: item.anchorMonth,
    oneTimeDate: item.oneTimeDate,
  };
}

export function mapLegacyLineItemsToBudgetItems(settings: AppSettings): BudgetItem[] {
  return settings.lineItems.map((item) => ({
    id: item.id,
    categoryId: item.category,
    categoryName: item.category,
    name: item.name,
    amount: item.defaultAmount,
    recurrenceType: recurrenceTypeForLineItem(item),
    recurrenceConfig: recurrenceConfigForLineItem(item),
    defaultPaymentAccountId: item.paymentMethod,
    defaultCashAccountId: "checking",
    paymentMethod: paymentMethodToAccountType(item.paymentMethod),
    active: true,
    legacyLineItemId: item.id,
  }));
}

export function mapSpendLogsToActualTransactions({
  spendLogs,
  settings,
}: {
  spendLogs: SpendLogEntry[];
  settings: AppSettings;
}): ActualTransaction[] {
  const lineItemsById = new Map(settings.lineItems.map((item) => [item.id, item]));

  return spendLogs.flatMap((entry) => {
    const item = lineItemsById.get(entry.rippleId);
    if (!item) return [];

    return {
      id: entry.id,
      userId: entry.userId,
      date: entry.date,
      merchant: item.name,
      amount: entry.amount,
      categoryId: item.category,
      categoryName: item.category,
      accountId: entry.paymentMethod,
      paymentMethod: paymentMethodToAccountType(entry.paymentMethod),
      notes: entry.note,
      source: "manual",
      plannedItemId: item.id,
      legacySpendLogId: entry.id,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    };
  });
}
