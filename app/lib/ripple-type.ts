import type { DockItemKind, ItemBehavior, LineItem, RippleType } from "./types";

const FLEXIBLE_CATEGORY_NAMES = new Set([
  "food",
  "entertainment",
  "personal care",
  "pets",
]);

const FLEXIBLE_NAME_PATTERNS = [
  "grocery",
  "groceries",
  "eating out",
  "dining",
  "restaurant",
  "takeout",
  "gas",
  "fuel",
  "entertainment",
  "fun",
];

export function defaultRippleTypeForCategory(category: string): RippleType {
  return FLEXIBLE_CATEGORY_NAMES.has(category.trim().toLowerCase()) ? "flexible" : "fixed";
}

export function getRippleType(item: Pick<LineItem, "isIncome" | "category" | "name" | "rippleType">): RippleType {
  if (item.isIncome) return "fixed";
  if (item.rippleType) return item.rippleType;

  const category = item.category.trim().toLowerCase();
  const name = item.name.trim().toLowerCase();
  if (FLEXIBLE_CATEGORY_NAMES.has(category)) return "flexible";
  if (FLEXIBLE_NAME_PATTERNS.some((pattern) => name.includes(pattern))) return "flexible";

  return "fixed";
}

export function isFlexibleRipple(item: Pick<LineItem, "isIncome" | "category" | "name" | "rippleType">) {
  return !item.isIncome && getRippleType(item) === "flexible";
}

export function getItemBehavior(item: Pick<LineItem, "isIncome" | "category" | "name" | "paymentMethod" | "rippleType">): ItemBehavior {
  if (item.isIncome) return "income";

  const category = item.category.trim().toLowerCase();
  const name = item.name.trim().toLowerCase();
  const looksLikeCardPayment =
    category === "credit cards"
    || (item.paymentMethod === "checking" && name.includes("payment") && /card|visa|mastercard|amex|capital one|chase|discover/.test(name));

  if (looksLikeCardPayment) return "credit_card_payment";
  if (isFlexibleRipple(item)) return "flexible_spend";
  return "fixed_bill";
}

export function getDockItemKind(item: Pick<LineItem, "isIncome" | "category" | "name" | "paymentMethod" | "rippleType">): DockItemKind {
  const behavior = getItemBehavior(item);
  if (behavior === "income") return "wave";
  if (behavior === "credit_card_payment") return "credit_card_payment";
  return "ripple";
}
