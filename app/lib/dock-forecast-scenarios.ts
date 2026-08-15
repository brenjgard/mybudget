type ScenarioWeek = {
  inflows: number;
  checkingOutflows: number;
  cardPayments: number;
  ending: number;
};

type ScenarioResult = {
  name: string;
  passed: boolean;
  actual: number;
  expected: number;
};

function buildScenarioCash({
  startingChecking,
  income,
  incomeReceived,
  checkingBill,
  checkingBillSkipped = false,
  cardSpend,
  cardPayment,
}: {
  startingChecking: number;
  income: number;
  incomeReceived: boolean;
  checkingBill: number;
  checkingBillSkipped?: boolean;
  cardSpend: number;
  cardPayment: number;
}): ScenarioWeek & { cardLiability: number } {
  const inflows = incomeReceived ? 0 : income;
  const checkingOutflows = checkingBillSkipped ? 0 : checkingBill;
  const cardPayments = cardPayment;

  return {
    inflows,
    checkingOutflows,
    cardPayments,
    ending: startingChecking + inflows - checkingOutflows - cardPayments,
    cardLiability: Math.max(0, cardSpend - cardPayment),
  };
}

function expectEqual(name: string, actual: number, expected: number): ScenarioResult {
  return { name, actual, expected, passed: Object.is(actual, expected) };
}

export function runDockForecastScenarios(): ScenarioResult[] {
  const receivedIncome = buildScenarioCash({
    startingChecking: 5000,
    income: 1200,
    incomeReceived: true,
    checkingBill: 0,
    cardSpend: 0,
    cardPayment: 0,
  });

  const openIncome = buildScenarioCash({
    startingChecking: 5000,
    income: 1200,
    incomeReceived: false,
    checkingBill: 0,
    cardSpend: 0,
    cardPayment: 0,
  });

  const cardSpendOnly = buildScenarioCash({
    startingChecking: 5000,
    income: 0,
    incomeReceived: false,
    checkingBill: 0,
    cardSpend: 100,
    cardPayment: 0,
  });

  const cardPayment = buildScenarioCash({
    startingChecking: 5000,
    income: 0,
    incomeReceived: false,
    checkingBill: 0,
    cardSpend: 100,
    cardPayment: 600,
  });

  const checkingBill = buildScenarioCash({
    startingChecking: 5000,
    income: 0,
    incomeReceived: false,
    checkingBill: 2480,
    cardSpend: 0,
    cardPayment: 0,
  });

  const skippedBill = buildScenarioCash({
    startingChecking: 5000,
    income: 0,
    incomeReceived: false,
    checkingBill: 2480,
    checkingBillSkipped: true,
    cardSpend: 0,
    cardPayment: 0,
  });

  return [
    expectEqual("received income is not added as future expected cash", receivedIncome.ending, 5000),
    expectEqual("open income is still projected", openIncome.ending, 6200),
    expectEqual("card spend does not reduce checking cash", cardSpendOnly.ending, 5000),
    expectEqual("card spend increases card liability", cardSpendOnly.cardLiability, 100),
    expectEqual("scheduled card payment reduces checking cash", cardPayment.ending, 4400),
    expectEqual("checking bill reduces checking cash once", checkingBill.ending, 2520),
    expectEqual("skipped checking bill is excluded from projection", skippedBill.ending, 5000),
  ];
}
