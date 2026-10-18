import type { AppSettings } from "./types";

export type OnboardingState = { version: 1; step: number; complete: boolean; dismissed?: boolean };
export function parseOnboarding(value: unknown): OnboardingState | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<OnboardingState>;
  return row.version === 1 && Number.isInteger(row.step) && Number(row.step) >= 0 && Number(row.step) <= 5 && typeof row.complete === "boolean"
    ? { version: 1, step: Number(row.step), complete: row.complete, dismissed: Boolean(row.dismissed) } : null;
}
export function needsOnboarding(settings: AppSettings | null, state: OnboardingState | null) {
  return !settings || Boolean(state && !state.complete);
}
export function remainingSetup(settings: AppSettings) {
  const tasks: { label: string; href: string }[] = [];
  if (!settings.lineItems.some(item => item.isIncome)) tasks.push({ label: "Add income", href: "/settings#waves" });
  if (!settings.lineItems.some(item => !item.isIncome && item.planType !== "weekly_allowance" && item.planType !== "monthly_allowance")) tasks.push({ label: "Add recurring bills", href: "/settings?add=budget" });
  if (!settings.lineItems.some(item => item.planType === "weekly_allowance" || item.planType === "monthly_allowance")) tasks.push({ label: "Add variable spending", href: "/settings?add=budget" });
  if (settings.creditCards.some(card => !card.statementClosingDay || !card.paymentDueDay)) tasks.push({ label: "Add card statement dates", href: "/fleet" });
  return tasks;
}
