import { calendarDate } from "./calendar-date";
import type { AppSettings } from "./types";

// Card estimates are emitted by their source month, even when their payment
// falls in the visible future. Load those months and the activity since them.
export function forecastHistoryStart(anchor: Date, settings: Pick<AppSettings, "creditCards">, oldestMonth?: string | null) {
  const recent = new Date(anchor);
  recent.setDate(recent.getDate() - 21);
  const dates = [recent, calendarDate(oldestMonth ? `${oldestMonth}-01` : undefined),
    ...settings.creditCards.map(card => calendarDate(card.currentBalanceUpdatedAt))];
  return new Date(Math.min(...dates.filter((date): date is Date => date !== null).map(date => date.getTime())));
}
