import { lineItemAppliesToWeek } from "./schedule";
import type { AppSettings } from "./types";

type WeekRange = {
  start: Date;
  end: Date;
  label: string;
};

export type MonthForecast = {
  startingBalance: number;
  weekTotals: number[];
  projectedBalances: number[];
  projectedForwardBalance: number;
  displayedForwardBalance: number;
  endingBalance: number;
  balanceLabel: "Projected Balance" | "Final Balance";
  isWeekWrapped: (weekIndex: number) => boolean;
};

export function buildMonthForecast({
  settings,
  amounts,
  weeks,
  month,
  monthKey,
  currentMonthKey,
  prevMonthKey,
  currentAnchor,
  monthBalances,
  closedWeeks,
  isMonthClosed,
}: {
  settings: AppSettings;
  amounts: Record<string, Record<number, number>>;
  weeks: WeekRange[];
  month: number;
  monthKey: string;
  currentMonthKey: string;
  prevMonthKey: string;
  currentAnchor: number;
  monthBalances: Record<string, number>;
  closedWeeks: Set<string>;
  isMonthClosed: boolean;
}): MonthForecast {
  const startingBalance = monthKey === currentMonthKey
    ? currentAnchor
    : monthBalances[prevMonthKey] ?? currentAnchor;

  const isWeekWrapped = (weekIndex: number) => (
    closedWeeks.has(`${monthKey}-checking-${weekIndex}`)
    || settings.creditCards.some((card) => closedWeeks.has(`${monthKey}-${card.id}-${weekIndex}`))
  );

  const weekTotals = weeks.map((week, weekIndex) => {
    if (isWeekWrapped(weekIndex)) return 0;

    let net = 0;
    for (const item of settings.lineItems) {
      if (!lineItemAppliesToWeek(item, weekIndex, week.start, week.end, month)) {
        continue;
      }

      const amount = amounts[item.id]?.[weekIndex] ?? 0;
      net += item.isIncome ? amount : -amount;
    }
    return net;
  });

  const projectedBalances = weekTotals.reduce<number[]>((balances, total) => {
    const previous = balances[balances.length - 1] ?? startingBalance;
    return [...balances, previous + total];
  }, []);

  const projectedForwardBalance = projectedBalances[projectedBalances.length - 1] ?? startingBalance;
  const displayedForwardBalance = isMonthClosed
    ? monthBalances[monthKey] ?? projectedForwardBalance
    : projectedForwardBalance;

  return {
    startingBalance,
    weekTotals,
    projectedBalances,
    projectedForwardBalance,
    displayedForwardBalance,
    endingBalance: projectedForwardBalance,
    balanceLabel: isMonthClosed ? "Final Balance" : "Projected Balance",
    isWeekWrapped,
  };
}
