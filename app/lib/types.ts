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
export type RippleType = "fixed" | "flexible";
export type ItemBehavior = "fixed_bill" | "flexible_spend" | "credit_card_payment" | "income";
export type DockItemKind = "ripple" | "wave" | "credit_card_payment";
export type DockItemStatus = "upcoming" | "pending" | "cleared" | "skipped" | "adjusted";
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

export type PreferredPaymentTiming = "on_due_date" | "days_before_due" | "specific_day";

export type CreditCardAccount = {
  id: PaymentMethod;
  label: string;
  statementClosingDay?: number;
  paymentDueDay?: number;
  preferredPaymentTiming?: PreferredPaymentTiming;
  preferredPaymentDaysBeforeDue?: number;
  preferredPaymentDay?: number;
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
  rippleType?: RippleType; // missing means fixed unless inferred for older saved ripples
  preferredPaymentDate?: string; // YYYY-MM-DD cash date override for checking obligations
  paymentDueDate?: string; // YYYY-MM-DD cash date fallback for checking obligations
};

export type SpendLogEntry = {
  id: string;
  userId?: string;
  monthKey: string;
  weekIndex: number;
  rippleId: string;
  amount: number;
  paymentMethod: PaymentMethod;
  date: string;
  note?: string;
  createdAt: string;
  updatedAt?: string;
};

export type DockItemState = {
  id?: string;
  userId?: string;
  monthKey: string;
  weekIndex: number;
  itemId: string;
  itemKind: DockItemKind;
  behaviorType: ItemBehavior;
  status: DockItemStatus;
  statusUpdatedAt?: string;
  plannedAmount?: number;
  actualAmount?: number;
  pendingUntil?: string;
  clearedAt?: string;
  note?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type AppSettings = {
  checkingBalance: number;
  creditCards: CreditCardAccount[];
  categories: string[];
  lineItems: LineItem[];
};
