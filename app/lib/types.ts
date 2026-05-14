export type PaymentMethod =
  | "checking"
  | (string & {});

export type FrequencyType =
  | "every-week"
  | "every-other-week"
  | "twice-a-month"
  | "once-a-month-1"
  | "once-a-month-2"
  | "once-a-month-3"
  | "once-a-month-4"
  | "quarterly"
  | "annually"
  | "week-1"
  | "week-2"
  | "week-3"
  | "week-4"
  | "week-5"
  | "biweekly-odd"
  | "biweekly-even";

export type WaveType = "recurring" | "oneTime";
export type RecurrenceType = "weekly" | "biweekly" | "twiceMonthly" | "monthly" | "custom";
export type RecurrenceUnit = "days" | "weeks" | "months";
export type DayOfMonth = number | "last";

export type Recurrence = {
  type: RecurrenceType;
  interval?: number;
  unit?: RecurrenceUnit;
  daysOfWeek?: number[];
  daysOfMonth?: DayOfMonth[];
  startDate?: string;
};

export type LineItem = {
  id: string;
  category: string;
  name: string;
  defaultAmount: number;
  paymentMethod: PaymentMethod;
  isIncome: boolean;
  frequency: FrequencyType;
  anchorDate?: string; // YYYY-MM-DD reference date for biweekly/every-other-week
  anchorMonth?: number; // 1-12, which month quarterly/annually items start
  waveType?: WaveType; // missing means recurring for older saved items
  oneTimeDate?: string; // YYYY-MM-DD for one-time waves/ripples
  recurrence?: Recurrence;
};

export type AppSettings = {
  checkingBalance: number;
  creditCards: { id: PaymentMethod; label: string }[];
  categories: string[];
  lineItems: LineItem[];
};
