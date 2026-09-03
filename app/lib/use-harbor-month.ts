"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { loadSettingsWithSupabaseFallback } from "./budget-settings";
import {
  buildBudgetForecast,
  buildCashFlowForecast,
  mapSpendLogsToActualTransactions,
} from "./cash-flow-model";
import { budgetRepo } from "./repositories/budget-repo";
import { getItemBehavior } from "./ripple-type";
import { buildProjectedAmounts, getWeekRanges, lineItemAppliesToWeek } from "./schedule";
import type {
  ActualTransaction,
  AppSettings,
  BudgetItem,
  CashFlowEvent,
  CreditCardPayment,
  LineItem,
  PaymentAccount,
  SpendLogEntry,
} from "./types";

function closedWeekIndexesFromKeys(monthKey: string, keys: Set<string>) {
  return new Set(
    [...keys].flatMap((key) => {
      if (!key.startsWith(`${monthKey}-`)) return [];
      const weekIndex = Number(key.split("-").at(-1));
      return Number.isInteger(weekIndex) ? [weekIndex] : [];
    }),
  );
}

function isoDate(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function paymentTypeFromSettingsMethod(paymentMethod: LineItem["paymentMethod"]) {
  return paymentMethod === "checking" ? "checking" : "credit_card";
}

function budgetItemWithSettingsMethod(item: BudgetItem, lineItemsById: Map<string, LineItem>): BudgetItem {
  const legacyLineItem = item.legacyLineItemId ? lineItemsById.get(item.legacyLineItemId) : undefined;
  if (!legacyLineItem) return item;

  return {
    ...item,
    categoryId: legacyLineItem.category,
    categoryName: legacyLineItem.category,
    name: legacyLineItem.name,
    defaultPaymentAccountId: legacyLineItem.paymentMethod,
    defaultCashAccountId: "checking",
    paymentMethod: paymentTypeFromSettingsMethod(legacyLineItem.paymentMethod),
    active: true,
  };
}

export function useHarborMonth() {
  const router = useRouter();
  const now = useMemo(() => new Date(), []);
  const year = now.getFullYear();
  const month = now.getMonth();
  const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
  const monthName = now.toLocaleString("en-US", { month: "long", year: "numeric" });
  const monthStartDate = `${monthKey}-01`;
  const monthEndDate = [
    year,
    String(month + 1).padStart(2, "0"),
    String(new Date(year, month + 1, 0).getDate()).padStart(2, "0"),
  ].join("-");

  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [anchorOverride, setAnchorOverride] = useState<number | null>(null);
  const [amounts, setAmounts] = useState<Record<string, Record<number, number>>>({});
  const [spendLogs, setSpendLogs] = useState<SpendLogEntry[]>([]);
  const [actualTransactions, setActualTransactions] = useState<ActualTransaction[]>([]);
  const [nativeBudgetItems, setNativeBudgetItems] = useState<BudgetItem[]>([]);
  const [cashFlowEvents, setCashFlowEvents] = useState<CashFlowEvent[]>([]);
  const [creditCardPayments, setCreditCardPayments] = useState<CreditCardPayment[]>([]);
  const [closedWeeks, setClosedWeeks] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [
        savedSettings,
        savedAmounts,
        savedAnchorOverride,
        savedClosedWeeks,
        savedSpendLogs,
        savedActualTransactions,
        savedBudgetItems,
        savedCashFlowEvents,
        savedCreditCardPayments,
      ] = await Promise.all([
        loadSettingsWithSupabaseFallback(),
        budgetRepo.getMonthlyAmounts(monthKey),
        budgetRepo.getAnchorOverride(),
        budgetRepo.getClosedWeeks(monthKey),
        budgetRepo.getSpendLogs(monthKey),
        budgetRepo.getActualTransactions(),
        budgetRepo.getBudgetItems(),
        budgetRepo.getCashFlowEvents(),
        budgetRepo.getCreditCardPayments(),
      ]);

      if (cancelled) return;
      if (!savedSettings) {
        router.push("/setup");
        return;
      }

      setSettings(savedSettings);
      setAnchorOverride(savedAnchorOverride);
      setClosedWeeks(savedClosedWeeks);
      setSpendLogs(savedSpendLogs);
      setActualTransactions(savedActualTransactions);
      setNativeBudgetItems(savedBudgetItems);
      setCashFlowEvents(savedCashFlowEvents);
      setCreditCardPayments(savedCreditCardPayments);
      setAmounts(buildProjectedAmounts(
        savedSettings,
        getWeekRanges(year, month),
        month,
        savedAmounts,
        closedWeekIndexesFromKeys(monthKey, savedClosedWeeks),
      ));
      setLoaded(true);
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [month, monthKey, router, year]);

  const weeks = useMemo(() => getWeekRanges(year, month), [year, month]);
  const currentAnchor = anchorOverride ?? settings?.checkingBalance ?? 0;

  const spendLogsByRippleWeek = useMemo(() => {
    const result: Record<string, SpendLogEntry[]> = {};
    spendLogs.forEach((entry) => {
      const key = `${entry.rippleId}-${entry.weekIndex}`;
      result[key] = result[key] ?? [];
      result[key].push(entry);
    });
    return result;
  }, [spendLogs]);

  const forecastAmounts = useMemo(() => {
    if (!settings) return amounts;

    return settings.lineItems.reduce<Record<string, Record<number, number>>>((nextAmounts, item) => {
      if (getItemBehavior(item) !== "flexible_spend") return nextAmounts;

      const nextByWeek = { ...(nextAmounts[item.id] ?? {}) };
      weeks.forEach((_, weekIndex) => {
        const planned = Number(amounts[item.id]?.[weekIndex] ?? 0);
        const spent = spendLogsByRippleWeek[`${item.id}-${weekIndex}`]?.reduce((sum, entry) => sum + entry.amount, 0) ?? 0;
        nextByWeek[weekIndex] = Math.max(planned, spent);
      });

      return { ...nextAmounts, [item.id]: nextByWeek };
    }, amounts);
  }, [amounts, settings, spendLogsByRippleWeek, weeks]);

  const paymentAccounts = useMemo<PaymentAccount[]>(() => {
    if (!settings) return [];
    return [
      {
        id: "checking",
        accountKey: "checking",
        kind: "checking",
        type: "checking",
        label: "Checking",
        currentBalance: currentAnchor,
        active: true,
      },
      ...settings.creditCards.map((card, index) => ({
        id: card.id,
        accountKey: card.id,
        kind: "credit" as const,
        type: "credit_card" as const,
        label: card.label,
        currentBalance: card.currentBalance ?? 0,
        statementCloseDay: card.statementClosingDay,
        statementClosingDay: card.statementClosingDay,
        active: true,
        sortOrder: index + 1,
      })),
    ];
  }, [currentAnchor, settings]);

  const lineItemsById = useMemo(() => new Map(
    settings?.lineItems.map((item) => [item.id, item]) ?? [],
  ), [settings]);

  const normalizedNativeBudgetItems = useMemo(
    () => nativeBudgetItems.map((item) => budgetItemWithSettingsMethod(item, lineItemsById)),
    [lineItemsById, nativeBudgetItems],
  );

  const currentMonthActualTransactions = useMemo(() => {
    if (!settings) return [];
    const mappedSpendLogs = mapSpendLogsToActualTransactions({ spendLogs, settings });
    const merged = new Map<string, ActualTransaction>();
    actualTransactions.forEach((transaction) => {
      if (transaction.date >= monthStartDate && transaction.date <= monthEndDate) {
        merged.set(transaction.legacySpendLogId ?? transaction.id, transaction);
      }
    });
    mappedSpendLogs.forEach((transaction) => {
      merged.set(transaction.legacySpendLogId ?? transaction.id, transaction);
    });
    return Array.from(merged.values());
  }, [actualTransactions, monthEndDate, monthStartDate, settings, spendLogs]);

  const legacyBudgetItems = useMemo<BudgetItem[]>(() => {
    if (!settings) return [];
    return settings.lineItems
      .filter((item) => !item.isIncome)
      .map((item) => ({
        id: item.id,
        categoryId: item.category,
        categoryName: item.category,
        name: item.name,
        amount: Object.values(forecastAmounts[item.id] ?? {}).reduce((sum, amount) => sum + Number(amount || 0), 0),
        recurrenceType: item.recurrence?.type ?? item.waveType ?? "legacy",
        recurrenceConfig: item.recurrence ?? null,
        defaultPaymentAccountId: item.paymentMethod,
        defaultCashAccountId: "checking",
        paymentMethod: item.paymentMethod === "checking" ? "checking" : "credit_card",
        active: true,
        legacyLineItemId: item.id,
      }));
  }, [forecastAmounts, settings]);

  const incomeLineItemIds = useMemo(() => new Set(
    settings?.lineItems.filter((item) => item.isIncome).map((item) => item.id) ?? [],
  ), [settings]);

  const incomeLineItemNames = useMemo(() => new Set(
    settings?.lineItems.filter((item) => item.isIncome).map((item) => item.name) ?? [],
  ), [settings]);

  const budgetItems = useMemo<BudgetItem[]>(() => {
    const nativeLegacyIds = new Set(normalizedNativeBudgetItems.map((item) => item.legacyLineItemId).filter(Boolean));
    return [
      ...normalizedNativeBudgetItems.filter((item) => (
        !incomeLineItemIds.has(item.legacyLineItemId ?? "")
        && !incomeLineItemNames.has(item.name)
        && item.categoryName !== "Income"
        && item.categoryId !== "Income"
      )),
      ...legacyBudgetItems.filter((item) => !nativeLegacyIds.has(item.legacyLineItemId)),
    ];
  }, [incomeLineItemIds, incomeLineItemNames, legacyBudgetItems, normalizedNativeBudgetItems]);

  const cashProjectionBudgetItems = useMemo<BudgetItem[]>(() => {
    if (!settings) return [];
    const nativeLegacyIds = new Set(normalizedNativeBudgetItems.map((item) => item.legacyLineItemId).filter(Boolean));
    const legacyItems = settings.lineItems.flatMap((item) => {
      if (nativeLegacyIds.has(item.id)) return [];
      if (item.isIncome || item.paymentMethod !== "checking") return [];
      if (item.category === "Credit Cards") return [];
      return weeks.flatMap((week, weekIndex) => {
        if (!lineItemAppliesToWeek(item, weekIndex, week.start, week.end, month)) return [];
        const amount = forecastAmounts[item.id]?.[weekIndex] ?? 0;
        if (amount <= 0) return [];
        return {
          id: `${item.id}-${weekIndex}`,
          categoryId: item.category,
          categoryName: item.category,
          name: item.name,
          amount,
          recurrenceType: "legacy-week",
          recurrenceConfig: { date: isoDate(week.start) },
          defaultPaymentAccountId: item.paymentMethod,
          defaultCashAccountId: "checking",
          paymentMethod: "checking",
          active: true,
          legacyLineItemId: item.id,
        } satisfies BudgetItem;
      });
    });
    const nativeItems = normalizedNativeBudgetItems
      .filter((item) => (
        item.active
        && (item.paymentMethod === "checking" || item.paymentMethod === "cash")
        && !incomeLineItemIds.has(item.legacyLineItemId ?? "")
        && !incomeLineItemNames.has(item.name)
        && item.categoryName !== "Income"
        && item.categoryId !== "Income"
      ))
      .map((item) => ({ ...item, defaultCashAccountId: item.defaultCashAccountId ?? "checking" }));
    return [...legacyItems, ...nativeItems];
  }, [forecastAmounts, incomeLineItemIds, incomeLineItemNames, month, normalizedNativeBudgetItems, settings, weeks]);

  const projectedIncomeCashEvents = useMemo<CashFlowEvent[]>(() => {
    if (!settings) return [];
    const savedIncomeEventIds = new Set(cashFlowEvents.map((event) => event.id));
    return settings.lineItems.flatMap((item) => {
      if (!item.isIncome) return [];
      return weeks.flatMap((week, weekIndex) => {
        if (!lineItemAppliesToWeek(item, weekIndex, week.start, week.end, month)) return [];
        const amount = forecastAmounts[item.id]?.[weekIndex] ?? 0;
        if (amount <= 0) return [];
        const id = `income-${item.id}-${weekIndex}`;
        if (savedIncomeEventIds.has(id)) return [];
        return {
          id,
          date: isoDate(week.start),
          amount,
          direction: "inflow",
          cashAccountId: "checking",
          name: item.name,
          category: "Income",
          status: "projected",
        } satisfies CashFlowEvent;
      });
    });
  }, [cashFlowEvents, forecastAmounts, month, settings, weeks]);

  const budgetForecast = useMemo(() => buildBudgetForecast({
    budgetItems,
    transactions: currentMonthActualTransactions,
    categories: settings?.categories.map((category) => ({ id: category, name: category })) ?? [],
    startDate: monthStartDate,
    endDate: monthEndDate,
  }), [budgetItems, currentMonthActualTransactions, monthEndDate, monthStartDate, settings]);

  const cashFlowForecast = useMemo(() => buildCashFlowForecast({
    startingBalance: currentAnchor,
    cashAccountId: "checking",
    accounts: paymentAccounts,
    transactions: currentMonthActualTransactions,
    cashFlowEvents: [...cashFlowEvents, ...projectedIncomeCashEvents],
    creditCardPayments,
    budgetItems: cashProjectionBudgetItems,
    startDate: monthStartDate,
    endDate: monthEndDate,
  }), [cashFlowEvents, cashProjectionBudgetItems, creditCardPayments, currentAnchor, currentMonthActualTransactions, monthEndDate, monthStartDate, paymentAccounts, projectedIncomeCashEvents]);

  const upcomingCashOutflows = cashFlowForecast.entries
    .filter((entry) => entry.direction === "outflow")
    .reduce((sum, entry) => sum + entry.amount, 0);

  async function saveBudgetItem(item: BudgetItem) {
    const savedItem = await budgetRepo.saveBudgetItem(item);
    setNativeBudgetItems((current) => {
      const without = current.filter((existing) => existing.id !== savedItem.id);
      return [...without, savedItem];
    });
  }

  async function deactivateBudgetItem(item: BudgetItem) {
    const savedItem = await budgetRepo.saveBudgetItem({ ...item, active: false });
    setNativeBudgetItems((current) => current.map((existing) => existing.id === savedItem.id ? savedItem : existing));
  }

  async function saveCashFlowEvent(event: CashFlowEvent) {
    const savedEvent = await budgetRepo.saveCashFlowEvent(event);
    setCashFlowEvents((current) => {
      const without = current.filter((item) => item.id !== savedEvent.id);
      return [...without, savedEvent].sort((a, b) => a.date.localeCompare(b.date));
    });
    return savedEvent;
  }

  async function updateCashEventStatus(eventId: string, status: CashFlowEvent["status"]) {
    const event = cashFlowEvents.find((item) => item.id === eventId);
    if (!event) return;
    await saveCashFlowEvent({ ...event, status });
  }

  async function deleteCashEvent(eventId: string) {
    await budgetRepo.deleteCashFlowEvent(eventId);
    setCashFlowEvents((current) => current.filter((item) => item.id !== eventId));
  }

  async function scheduleCreditCardPayment(payment: CreditCardPayment) {
    const savedPayment = await budgetRepo.saveCreditCardPayment(payment);
    setCreditCardPayments((current) => {
      const without = current.filter((item) => item.id !== savedPayment.id);
      return [...without, savedPayment].sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
    });
    return savedPayment;
  }

  async function markCreditCardPayment(payment: CreditCardPayment, status: CreditCardPayment["status"]) {
    await scheduleCreditCardPayment({
      ...payment,
      status,
      paidDate: status === "paid" ? payment.paidDate ?? new Date().toISOString().slice(0, 10) : payment.paidDate,
    });
    if (status === "paid") {
      const linkedEvents = cashFlowEvents.filter((event) => event.linkedCreditCardPaymentId === payment.id);
      await Promise.all(linkedEvents.map((event) => updateCashEventStatus(event.id, "cleared")));
    }
  }

  async function deleteCreditCardPayment(payment: CreditCardPayment) {
    await budgetRepo.deleteCreditCardPayment(payment.id);
    setCreditCardPayments((current) => current.filter((item) => item.id !== payment.id));
  }

  async function saveCheckingBalance(balance: number | null) {
    const saved = await budgetRepo.saveAnchorOverride(balance);
    setAnchorOverride(saved);
    return saved;
  }

  async function saveActualTransaction(transaction: ActualTransaction) {
    const savedTransaction = await budgetRepo.saveActualTransaction(transaction);
    setActualTransactions((current) => {
      const without = current.filter((item) => item.id !== savedTransaction.id);
      return [...without, savedTransaction].sort((a, b) => a.date.localeCompare(b.date));
    });
    return savedTransaction;
  }

  return {
    loaded,
    settings,
    monthName,
    monthStartDate,
    monthEndDate,
    currentAnchor,
    weeks,
    monthKey,
    forecastAmounts,
    paymentAccounts,
    budgetItems,
    currentMonthActualTransactions,
    cashFlowEvents,
    creditCardPayments,
    budgetForecast,
    cashFlowForecast,
    upcomingCashOutflows,
    closedWeeks,
    saveBudgetItem,
    deactivateBudgetItem,
    saveCashFlowEvent,
    updateCashEventStatus,
    deleteCashEvent,
    scheduleCreditCardPayment,
    markCreditCardPayment,
    deleteCreditCardPayment,
    saveCheckingBalance,
    saveActualTransaction,
  };
}
