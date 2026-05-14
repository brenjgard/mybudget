import type { DayOfMonth, FrequencyType, LineItem, Recurrence } from "./types";

export function getWeekRanges(year: number, month: number) {
  const weeks: { start: Date; end: Date; label: string }[] = [];
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  const firstDayOfWeek = firstDay.getDay();
  const daysToSaturday = firstDayOfWeek === 6 ? 0 : -(firstDayOfWeek + 1);
  let weekStart = new Date(firstDay);
  weekStart.setDate(firstDay.getDate() + daysToSaturday);

  if (weekStart < firstDay) {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    const daysInCurrentMonth = Math.round(
      (weekEnd.getTime() - firstDay.getTime()) / (1000 * 60 * 60 * 24)
    ) + 1;

    if (daysInCurrentMonth <= 3) {
      weekStart = new Date(weekStart);
      weekStart.setDate(weekStart.getDate() + 7);
    }
  }

  const current = new Date(weekStart);

  while (true) {
    const start = new Date(current);
    const end = new Date(current);
    end.setDate(end.getDate() + 6);

    if (start > lastDay) break;

    const daysIntoNextMonth = end > lastDay
      ? Math.round((end.getTime() - lastDay.getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    if (daysIntoNextMonth >= 4) break;

    const fmt = (d: Date) =>
      d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

    weeks.push({
      start,
      end,
      label: `${fmt(start)} – ${fmt(end)}`,
    });

    current.setDate(current.getDate() + 7);
  }

  return weeks;
}

export function itemAppliesToWeek(
  frequency: FrequencyType,
  weekIdx: number,
  weekStart: Date,
  weekEnd: Date,
  anchorDate?: string,
  anchorMonth?: number,
  month?: number
): boolean {
  switch (frequency) {
    case "every-week":       return true;
    case "twice-a-month":    return weekIdx === 0 || weekIdx === 2;
    case "once-a-month-1":   return weekIdx === 0;
    case "once-a-month-2":   return weekIdx === 1;
    case "once-a-month-3":   return weekIdx === 2;
    case "once-a-month-4":   return weekIdx === 3;
    case "week-1":           return weekIdx === 0;
    case "week-2":           return weekIdx === 1;
    case "week-3":           return weekIdx === 2;
    case "week-4":           return weekIdx === 3;
    case "week-5":           return weekIdx === 4;
    case "annually":
      return weekIdx === 0 && (month! + 1) === (anchorMonth ?? 1);
    case "quarterly": {
      const anchor = (anchorMonth ?? 1) - 1;
      const monthsFromAnchor = ((month ?? 0) - anchor + 12) % 12;
      return weekIdx === 0 && monthsFromAnchor % 3 === 0;
    }
    case "every-other-week":
    case "biweekly-odd":
    case "biweekly-even": {
      if (!anchorDate) return weekIdx % 2 === 0;
      const [ay, am, ad] = anchorDate.split("-").map(Number);
      const anchorUTC = Date.UTC(ay, (am ?? 1) - 1, ad ?? 1);
      const anchorDayOfWeek = new Date(anchorUTC).getUTCDay();
      const daysToSat = anchorDayOfWeek === 6 ? 0 : -(anchorDayOfWeek + 1);
      const anchorWeekUTC = anchorUTC + daysToSat * 86400000;

      const ws = weekStart;
      const weekStartUTC = Date.UTC(ws.getFullYear(), ws.getMonth(), ws.getDate());

      const diffDays = Math.round((weekStartUTC - anchorWeekUTC) / 86400000);
      const diffWeeks = Math.round(diffDays / 7);

      return Math.abs(diffWeeks) % 2 === 0;
    }
    default: return false;
  }
}

function parseISODateOnly(value?: string) {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function daysBetween(start: Date, end: Date) {
  const startUTC = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const endUTC = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.round((endUTC - startUTC) / 86400000);
}

function monthsBetween(start: Date, end: Date) {
  return (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
}

function lastDayOfMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function dayMatchesDayOfMonth(date: Date, day: DayOfMonth) {
  if (day === "last") return date.getDate() === lastDayOfMonth(date.getFullYear(), date.getMonth());
  return date.getDate() === day;
}

function recurrenceHasOccurrenceOnDate(recurrence: Recurrence, date: Date) {
  const startDate = parseISODateOnly(recurrence.startDate);
  const dayOfWeek = date.getDay();

  switch (recurrence.type) {
    case "weekly":
      return (recurrence.daysOfWeek?.length ? recurrence.daysOfWeek : [5]).includes(dayOfWeek);

    case "biweekly": {
      if (!startDate) return false;
      const dayMatches = (recurrence.daysOfWeek?.length ? recurrence.daysOfWeek : [startDate.getDay()]).includes(dayOfWeek);
      if (!dayMatches || date < startDate) return false;
      const diffWeeks = Math.floor(daysBetween(startDate, date) / 7);
      return diffWeeks % 2 === 0;
    }

    case "twiceMonthly":
    case "monthly": {
      const days = recurrence.daysOfMonth?.length ? recurrence.daysOfMonth : [1];
      return days.some((day) => dayMatchesDayOfMonth(date, day));
    }

    case "custom": {
      if (!startDate || date < startDate) return false;
      const interval = Math.max(1, recurrence.interval ?? 1);
      switch (recurrence.unit ?? "weeks") {
        case "days":
          return daysBetween(startDate, date) % interval === 0;
        case "weeks": {
          const dayMatches = (recurrence.daysOfWeek?.length ? recurrence.daysOfWeek : [startDate.getDay()]).includes(dayOfWeek);
          if (!dayMatches) return false;
          const diffWeeks = Math.floor(daysBetween(startDate, date) / 7);
          return diffWeeks % interval === 0;
        }
        case "months": {
          const diffMonths = monthsBetween(startDate, date);
          if (diffMonths < 0 || diffMonths % interval !== 0) return false;
          const days = recurrence.daysOfMonth?.length ? recurrence.daysOfMonth : [startDate.getDate()];
          return days.some((day) => dayMatchesDayOfMonth(date, day));
        }
      }
    }
  }
}

function recurrenceAppliesToWeek(
  recurrence: Recurrence,
  weekStart: Date,
  weekEnd: Date,
  month: number
) {
  for (let date = new Date(weekStart); date <= weekEnd; date = addDays(date, 1)) {
    if (date.getMonth() !== month) continue;
    if (recurrenceHasOccurrenceOnDate(recurrence, date)) return true;
  }

  return false;
}

export function recurrenceFromLegacyFrequency(item: LineItem): Recurrence {
  const anchorDate = parseISODateOnly(item.anchorDate);
  const anchorDay = anchorDate?.getDay() ?? 5;

  switch (item.frequency) {
    case "every-week":
      return { type: "weekly", daysOfWeek: [anchorDay] };
    case "every-other-week":
    case "biweekly-odd":
    case "biweekly-even":
      return { type: "biweekly", daysOfWeek: [anchorDay], startDate: item.anchorDate };
    case "twice-a-month":
      return { type: "twiceMonthly", daysOfMonth: [1, 15] };
    case "once-a-month-1":
    case "week-1":
      return { type: "monthly", daysOfMonth: [1] };
    case "once-a-month-2":
    case "week-2":
      return { type: "monthly", daysOfMonth: [8] };
    case "once-a-month-3":
    case "week-3":
      return { type: "monthly", daysOfMonth: [15] };
    case "once-a-month-4":
    case "week-4":
      return { type: "monthly", daysOfMonth: [22] };
    case "week-5":
      return { type: "monthly", daysOfMonth: ["last"] };
    case "quarterly":
      return {
        type: "custom",
        interval: 3,
        unit: "months",
        daysOfMonth: [1],
        startDate: `2026-${String(item.anchorMonth ?? 1).padStart(2, "0")}-01`,
      };
    case "annually":
      return {
        type: "custom",
        interval: 12,
        unit: "months",
        daysOfMonth: [1],
        startDate: `2026-${String(item.anchorMonth ?? 1).padStart(2, "0")}-01`,
      };
  }
}

export function getRecurrence(item: LineItem): Recurrence {
  return item.recurrence ?? recurrenceFromLegacyFrequency(item);
}

export function getDefaultRecurrence(): Recurrence {
  return { type: "weekly", daysOfWeek: [5] };
}

export function recurrenceLabel(recurrence?: Recurrence) {
  if (!recurrence) return "Recurring";
  switch (recurrence.type) {
    case "weekly":
      return "Weekly";
    case "biweekly":
      return "Every other week";
    case "twiceMonthly":
      return "Twice a month";
    case "monthly":
      return "Monthly";
    case "custom":
      return `Every ${recurrence.interval ?? 1} ${recurrence.unit ?? "weeks"}`;
  }
}

export function lineItemAppliesToWeek(
  item: LineItem,
  weekIdx: number,
  weekStart: Date,
  weekEnd: Date,
  month: number
): boolean {
  if (item.waveType === "oneTime") {
    const oneTimeDate = parseISODateOnly(item.oneTimeDate);
    if (!oneTimeDate) return false;
    return (
      oneTimeDate.getMonth() === month &&
      oneTimeDate >= weekStart &&
      oneTimeDate <= weekEnd
    );
  }

  if (item.recurrence) {
    return recurrenceAppliesToWeek(item.recurrence, weekStart, weekEnd, month);
  }

  return itemAppliesToWeek(
    item.frequency,
    weekIdx,
    weekStart,
    weekEnd,
    item.anchorDate,
    item.anchorMonth,
    month
  );
}

export function buildProjectedAmounts(
  settings: { lineItems: LineItem[] },
  weeks: { start: Date; end: Date }[],
  month: number,
  savedAmounts: Record<string, Record<number, number>>
) {
  const next: Record<string, Record<number, number>> = {};

  for (const item of settings.lineItems) {
    next[item.id] = {};

    weeks.forEach((week, weekIndex) => {
      const savedVal = savedAmounts[item.id]?.[weekIndex];
      const applies = lineItemAppliesToWeek(item, weekIndex, week.start, week.end, month);

      if (applies) {
        next[item.id][weekIndex] = savedVal ?? item.defaultAmount;
        return;
      }

      if (item.waveType !== "oneTime" && savedVal !== undefined) {
        next[item.id][weekIndex] = savedVal;
      }
    });
  }

  return next;
}

export function recurrenceDebugScenarios() {
  const mayWeeks = getWeekRanges(2026, 4);
  const juneWeeks = getWeekRanges(2026, 5);

  const applies = (item: LineItem, weeks: { start: Date; end: Date }[], month: number) =>
    weeks.map((week, weekIndex) => lineItemAppliesToWeek(item, weekIndex, week.start, week.end, month));

  const base: LineItem = {
    id: "debug",
    category: "Debug",
    name: "Debug",
    defaultAmount: 1,
    paymentMethod: "checking",
    isIncome: true,
    frequency: "every-week",
    waveType: "recurring",
  };

  return {
    mayWeekLabels: mayWeeks.map((week) => week.label),
    juneWeekLabels: juneWeeks.map((week) => week.label),
    weeklyFriday: applies({ ...base, recurrence: { type: "weekly", daysOfWeek: [5] } }, mayWeeks, 4),
    biweeklyFriday: applies({ ...base, recurrence: { type: "biweekly", daysOfWeek: [5], startDate: "2026-05-01" } }, mayWeeks, 4),
    twiceMonthly15Last: applies({ ...base, recurrence: { type: "twiceMonthly", daysOfMonth: [15, "last"] } }, juneWeeks, 5),
    monthlyLastDay: applies({ ...base, recurrence: { type: "monthly", daysOfMonth: ["last"] } }, juneWeeks, 5),
    oldSavedEveryWeek: applies({ ...base, recurrence: undefined }, juneWeeks, 5),
  };
}
