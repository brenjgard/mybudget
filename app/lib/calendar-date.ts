// Date-only values are local calendar days; timestamps must first be converted
// to the user's local day (slicing an ISO timestamp instead uses the UTC day).
export function calendarDate(value?: string) {
  if (!value) return null;
  if (value.includes("T")) {
    const timestamp = new Date(value);
    return Number.isNaN(timestamp.getTime()) ? null : new Date(timestamp.getFullYear(), timestamp.getMonth(), timestamp.getDate());
  }
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

export function calendarDay(value?: string) {
  const date = calendarDate(value);
  return date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}` : "";
}
