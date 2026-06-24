export type HelpTopic =
  | "currentAnchor"
  | "projectedBalance"
  | "finalBalance"
  | "incomeWaves"
  | "billsRipples"
  | "wrapWeek"
  | "closeMonth"
  | "buoys"
  | "dock";

export const helpCopy: Record<HelpTopic, { title: string; body: string }> = {
  currentAnchor: {
    title: "Current Anchor",
    body: "Your actual checking balance the last time you updated Harbor. Forecasts start from here.",
  },
  projectedBalance: {
    title: "Projected Checking Cash",
    body: "Where Harbor expects checking cash to land after cash inflows, checking/cash outflows, and scheduled card payments.",
  },
  finalBalance: {
    title: "Final Checking Cash",
    body: "The saved checking cash balance for a closed month. Closed months are read-only.",
  },
  incomeWaves: {
    title: "Income (Waves)",
    body: "Money coming in, like paychecks, freelance income, or recurring deposits.",
  },
  billsRipples: {
    title: "Bills & Spending (Ripples)",
    body: "Money going out, like bills, subscriptions, groceries, savings, or planned spending.",
  },
  wrapWeek: {
    title: "Wrap Week",
    body: "Mark a week as handled. Wrapped weeks stay visible for history but no longer count as pending.",
  },
  closeMonth: {
    title: "Close Month",
    body: "Save the month ending balance and make the month read-only so the next month starts cleanly.",
  },
  buoys: {
    title: "Buoys",
    body: "Savings goals or attention points you want to keep visible while planning.",
  },
  dock: {
    title: "Cash Flow Dock",
    body: "The week-by-week cash surface where you review checking cash inflows, outflows, card payments, and projected checking cash.",
  },
};

