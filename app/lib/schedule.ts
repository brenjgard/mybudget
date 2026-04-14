import type { FrequencyType } from "./types";

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
