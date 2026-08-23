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

type ScenarioCashEvent = {
  date: string;
  amount: number;
  kind: "income" | "checkingBill" | "cardPayment" | "transfer";
};

type ChronologicalScenario = {
  ending: number;
  lowest: number;
  lowestDate: string;
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

function committedAheadTotal(events: ScenarioCashEvent[], afterDate: string) {
  const after = new Date(`${afterDate}T00:00:00`);
  return events
    .filter((event) => new Date(`${event.date}T00:00:00`) > after && event.kind !== "income")
    .reduce((sum, event) => sum + event.amount, 0);
}

function chronologicalForecast(startingChecking: number, events: ScenarioCashEvent[]): ChronologicalScenario {
  let running = startingChecking;
  let lowest = startingChecking;
  let lowestDate = events[0]?.date ?? "";

  [...events]
    .sort((a, b) => (
      a.date.localeCompare(b.date)
      || (a.kind === "income" ? 0 : 1) - (b.kind === "income" ? 0 : 1)
    ))
    .forEach((event) => {
      running += event.kind === "income" ? event.amount : -event.amount;
      if (running < lowest) {
        lowest = running;
        lowestDate = event.date;
      }
    });

  return { ending: running, lowest, lowestDate };
}

function activeCardCycleObligation(currentBalance: number, scheduledClosedPayments: number, newSpending: number) {
  return Math.max(0, currentBalance - scheduledClosedPayments) + newSpending;
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

  const committedAhead = committedAheadTotal([
    { date: "2026-08-24", amount: 1200, kind: "income" },
    { date: "2026-09-01", amount: 2680, kind: "checkingBill" },
    { date: "2026-09-02", amount: 600, kind: "cardPayment" },
  ], "2026-08-23");

  const temporaryShortage = chronologicalForecast(7800, [
    { date: "2026-09-18", amount: 3900, kind: "income" },
    { date: "2026-09-15", amount: 3900, kind: "income" },
    { date: "2026-09-15", amount: 9300, kind: "cardPayment" },
    { date: "2026-09-16", amount: 3000, kind: "checkingBill" },
  ]);

  const anchoredCardObligation = activeCardCycleObligation(9500, 9300, 180);

  return [
    expectEqual("received income is not added as future expected cash", receivedIncome.ending, 5000),
    expectEqual("open income is still projected", openIncome.ending, 6200),
    expectEqual("card spend does not reduce checking cash", cardSpendOnly.ending, 5000),
    expectEqual("card spend increases card liability", cardSpendOnly.cardLiability, 100),
    expectEqual("scheduled card payment reduces checking cash", cardPayment.ending, 4400),
    expectEqual("checking bill reduces checking cash once", checkingBill.ending, 2520),
    expectEqual("skipped checking bill is excluded from projection", skippedBill.ending, 5000),
    expectEqual("committed ahead totals future checking obligations only", committedAhead, 3280),
    expectEqual("chronological cash forecast ends positive", temporaryShortage.ending, 3300),
    expectEqual("chronological cash forecast exposes temporary low", temporaryShortage.lowest, -600),
    expectEqual("card balance anchor allocates closed obligations before active cycle", anchoredCardObligation, 380),
  ];
}
