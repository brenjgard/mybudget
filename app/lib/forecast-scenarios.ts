import {
  buildBudgetForecast,
  buildCashFlowForecast,
} from "./cash-flow-model";
import type {
  ActualTransaction,
  BudgetItem,
  CashFlowEvent,
  CreditCardPayment,
  PaymentAccount,
} from "./types";

type ScenarioResult = {
  name: string;
  passed: boolean;
  details: Record<string, number | string | boolean | undefined>;
};

function expectEqual(name: string, details: ScenarioResult["details"], actual: number, expected: number): ScenarioResult {
  return {
    name,
    passed: actual === expected,
    details: {
      ...details,
      actual,
      expected,
    },
  };
}

const accounts: PaymentAccount[] = [
  {
    id: "checking",
    accountKey: "checking",
    kind: "checking",
    type: "checking",
    label: "Checking",
    currentBalance: 5000,
    active: true,
  },
  {
    id: "primary-card",
    accountKey: "primary-card",
    kind: "credit",
    type: "credit_card",
    label: "Primary Credit Card",
    currentBalance: 0,
    active: true,
  },
];

const groceriesBudget: BudgetItem = {
  id: "groceries-budget",
  categoryId: "groceries",
  categoryName: "Groceries",
  name: "Groceries",
  amount: 1000,
  recurrenceType: "monthly",
  recurrenceConfig: { daysOfMonth: [1] },
  defaultPaymentAccountId: "primary-card",
  defaultCashAccountId: "checking",
  paymentMethod: "credit_card",
  active: true,
};

const mortgageBudget: BudgetItem = {
  id: "mortgage-budget",
  categoryId: "mortgage",
  categoryName: "Mortgage",
  name: "Mortgage",
  amount: 2480,
  recurrenceType: "monthly",
  recurrenceConfig: { daysOfMonth: [28] },
  defaultPaymentAccountId: "checking",
  defaultCashAccountId: "checking",
  paymentMethod: "checking",
  active: true,
};

const checkingPlannedBudget: BudgetItem = {
  id: "checking-planned-budget",
  categoryId: "utilities",
  categoryName: "Utilities",
  name: "Utilities",
  amount: 300,
  recurrenceType: "monthly",
  recurrenceConfig: { daysOfMonth: [12] },
  defaultPaymentAccountId: "checking",
  defaultCashAccountId: "checking",
  paymentMethod: "checking",
  active: true,
};

const cardPlannedBudget: BudgetItem = {
  ...checkingPlannedBudget,
  id: "card-planned-budget",
  defaultPaymentAccountId: "primary-card",
  paymentMethod: "credit_card",
};

const groceryCardTransaction: ActualTransaction = {
  id: "grocery-transaction",
  date: "2026-06-24",
  merchant: "Kroger",
  amount: 100,
  categoryId: "groceries",
  categoryName: "Groceries",
  accountId: "primary-card",
  paymentMethod: "credit_card",
  source: "manual",
  plannedItemId: "groceries-budget",
};

const mortgageCheckingTransaction: ActualTransaction = {
  id: "mortgage-transaction",
  date: "2026-06-28",
  merchant: "Mortgage",
  amount: 2480,
  categoryId: "mortgage",
  categoryName: "Mortgage",
  accountId: "checking",
  paymentMethod: "checking",
  source: "manual",
  plannedItemId: "mortgage-budget",
};

function cardPayment(
  id: string,
  scheduledDate: string,
  status: CreditCardPayment["status"] = "planned",
): CreditCardPayment {
  return {
    id,
    creditCardAccountId: "primary-card",
    cashAccountId: "checking",
    amount: 600,
    scheduledDate,
    status,
  };
}

function linkedPaymentEvent(paymentId: string): CashFlowEvent {
  return {
    id: `event-${paymentId}`,
    date: "2026-07-15",
    amount: 600,
    direction: "outflow",
    cashAccountId: "checking",
    linkedCreditCardPaymentId: paymentId,
    name: "Primary Credit Card payment",
    category: "Credit card payment",
    status: "cleared",
  };
}

function cashEvent(amount: number, status: CashFlowEvent["status"] = "scheduled"): CashFlowEvent {
  return {
    id: `cash-event-${amount}-${status}`,
    date: "2026-06-20",
    amount,
    direction: "outflow",
    cashAccountId: "checking",
    name: "One-time bill",
    category: "One-time cash event",
    status,
  };
}

function buildBudget(transactions: ActualTransaction[] = []) {
  return buildBudgetForecast({
    budgetItems: [groceriesBudget, mortgageBudget],
    transactions,
    categories: [
      { id: "groceries", name: "Groceries" },
      { id: "mortgage", name: "Mortgage" },
    ],
    startDate: "2026-06-01",
    endDate: "2026-06-30",
  });
}

function buildCash(options: {
  transactions?: ActualTransaction[];
  cashFlowEvents?: CashFlowEvent[];
  creditCardPayments?: CreditCardPayment[];
  budgetItems?: BudgetItem[];
  startDate?: string;
  endDate?: string;
} = {}) {
  return buildCashFlowForecast({
    startingBalance: 5000,
    cashAccountId: "checking",
    accounts,
    transactions: options.transactions ?? [],
    cashFlowEvents: options.cashFlowEvents ?? [],
    creditCardPayments: options.creditCardPayments ?? [],
    budgetItems: options.budgetItems ?? [],
    startDate: options.startDate ?? "2026-06-01",
    endDate: options.endDate ?? "2026-06-30",
  });
}

export function runPhase5ForecastScenarios(): ScenarioResult[] {
  const cardPurchaseBudget = buildBudget([groceryCardTransaction]);
  const groceries = cardPurchaseBudget.categories.find((category) => category.categoryId === "groceries");
  const cardPurchaseCash = buildCash({ transactions: [groceryCardTransaction] });

  const julyPayment = cardPayment("payment-july", "2026-07-15");
  const juneBudgetWithPayment = buildBudget([groceryCardTransaction]);
  const julyCashWithPayment = buildCash({
    transactions: [groceryCardTransaction],
    creditCardPayments: [julyPayment],
    startDate: "2026-07-01",
    endDate: "2026-07-31",
  });

  const mortgageBudgetForecast = buildBudget([mortgageCheckingTransaction]);
  const mortgage = mortgageBudgetForecast.categories.find((category) => category.categoryId === "mortgage");
  const mortgageCash = buildCash({
    transactions: [mortgageCheckingTransaction],
    budgetItems: [mortgageBudget],
  });

  const paidPayment = cardPayment("payment-paid", "2026-07-15", "paid");
  const paidLinkedCash = buildCash({
    creditCardPayments: [paidPayment],
    cashFlowEvents: [linkedPaymentEvent(paidPayment.id)],
    startDate: "2026-07-01",
    endDate: "2026-07-31",
  });

  const skippedPaymentCash = buildCash({
    creditCardPayments: [cardPayment("payment-skipped", "2026-07-15", "skipped")],
    startDate: "2026-07-01",
    endDate: "2026-07-31",
  });

  const addedCashEvent = buildCash({ cashFlowEvents: [cashEvent(200)] });
  const editedCashEvent = buildCash({ cashFlowEvents: [cashEvent(125)] });
  const skippedCashEvent = buildCash({ cashFlowEvents: [cashEvent(200, "skipped")] });
  const deletedCashEvent = buildCash();

  const creditCardBudgetCash = buildCash({ budgetItems: [cardPlannedBudget] });
  const checkingBudgetCash = buildCash({ budgetItems: [checkingPlannedBudget] });

  return [
    expectEqual("1: card purchase changes Budget actual", {}, groceries?.actual ?? 0, 100),
    expectEqual("1: card purchase changes Budget remaining", {}, groceries?.remaining ?? 0, 900),
    expectEqual("1: card purchase does not change Cash Dock", {}, cardPurchaseCash.endingBalance, 5000),
    expectEqual("2: card payment does not change Budget actuals", {}, juneBudgetWithPayment.totalActual, 100),
    expectEqual("2: card payment changes Cash Dock", {}, julyCashWithPayment.endingBalance, 4400),
    expectEqual("3: checking bill changes Budget actual", {}, mortgage?.actual ?? 0, 2480),
    expectEqual("3: checking bill changes Cash Dock", {}, mortgageCash.endingBalance, 2520),
    expectEqual("4: paid linked card payment counted once", {}, paidLinkedCash.endingBalance, 4400),
    expectEqual("5: skipped card payment excluded from Cash Dock", {}, skippedPaymentCash.endingBalance, 5000),
    expectEqual("6: added cash event changes Cash Dock", {}, addedCashEvent.endingBalance, 4800),
    expectEqual("6: edited cash event updates Cash Dock", {}, editedCashEvent.endingBalance, 4875),
    expectEqual("6: skipped cash event excluded from Cash Dock", {}, skippedCashEvent.endingBalance, 5000),
    expectEqual("6: deleted cash event restores Cash Dock", {}, deletedCashEvent.endingBalance, 5000),
    expectEqual("7: credit-card budget item does not reduce checking cash", {}, creditCardBudgetCash.endingBalance, 5000),
    expectEqual("8: checking budget item reduces projected checking cash", {}, checkingBudgetCash.endingBalance, 4700),
  ];
}

export const runPhase2ForecastScenarios = runPhase5ForecastScenarios;
