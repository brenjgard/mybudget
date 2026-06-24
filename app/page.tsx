"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import type { MouseEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BudgetForecastPanel } from "./components/BudgetForecastPanel";
import { BudgetItemManager } from "./components/BudgetItemManager";
import { CashFlowDock } from "./components/CashFlowDock";
import { CreditCardSummaryPanel } from "./components/CreditCardSummaryPanel";
import { EmptyState } from "./components/EmptyState";
import { HelpTooltip } from "./components/HelpTooltip";
import { InfoCallout } from "./components/InfoCallout";
import { loadSettingsWithSupabaseFallback } from "./lib/budget-settings";
import { buildBudgetForecast, buildCashFlowForecast, mapSpendLogsToActualTransactions } from "./lib/cash-flow-model";
import { buildMonthForecast } from "./lib/forecast";
import { helpCopy } from "./lib/help-copy";
import { budgetRepo } from "./lib/repositories/budget-repo";
import { getItemBehavior } from "./lib/ripple-type";
import { buildProjectedAmounts, getWeekRanges, lineItemAppliesToWeek, recurrenceDebugScenarios } from "./lib/schedule";
import type { ActualTransaction, AppSettings, BudgetItem, CashFlowEvent, CreditCardPayment, PaymentAccount, PaymentMethod, SpendLogEntry } from "./lib/types";

function formatMoney(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function HarborSpinner({ label }: { label: string }) {
  return (
    <div className="inline-flex items-center gap-2 text-harbor-navy/60">
      <span className="relative inline-flex h-6 w-6 items-center justify-center" aria-hidden="true">
        <span className="absolute h-6 w-6 rounded-full border-2 border-harbor-teal/20 border-t-harbor-teal animate-spin" />
        <svg className="h-3.5 w-3.5 text-harbor-navy" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="5" r="2" />
          <path d="M12 7v14" />
          <path d="M5 14h14" />
          <path d="M7 17c1.2 2.5 3 4 5 4s3.8-1.5 5-4" />
          <path d="M5 14l2-2" />
          <path d="M19 14l-2-2" />
        </svg>
      </span>
      <span className="text-sm font-medium">{label}</span>
    </div>
  );
}

function closedWeekIndexesFromKeys(monthKey: string, keys: Set<string>) {
  return new Set(
    [...keys].flatMap((key) => {
      if (!key.startsWith(`${monthKey}-`)) return [];
      const weekIndex = Number(key.split("-").at(-1));
      return Number.isInteger(weekIndex) ? [weekIndex] : [];
    })
  );
}

type PendingConfirmation =
  | { type: "close-month" };

type SpendLogDraft = {
  rippleId: string;
  weekIndex: number;
  amount: string;
  paymentMethod: PaymentMethod;
  date: string;
  note: string;
};

type SpendLogTarget = {
  source: "global" | "detail";
};

const BLANK_SPEND_LOG: SpendLogDraft = {
  rippleId: "",
  weekIndex: 0,
  amount: "",
  paymentMethod: "checking",
  date: "",
  note: "",
};

function todayISODate() {
  const today = new Date();
  return [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0"),
  ].join("-");
}

export default function Home() {
  const router = useRouter();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [currentBalance, setCurrentBalance] = useState<number | "">("");
  const [anchorDraft, setAnchorDraft] = useState("");
  const [isEditingAnchor, setIsEditingAnchor] = useState(false);
  const [amounts, setAmounts] = useState<Record<string, Record<number, number>>>({});
  const [spendLogs, setSpendLogs] = useState<SpendLogEntry[]>([]);
  const [actualTransactions, setActualTransactions] = useState<ActualTransaction[]>([]);
  const [nativeBudgetItems, setNativeBudgetItems] = useState<BudgetItem[]>([]);
  const [cashFlowEvents, setCashFlowEvents] = useState<CashFlowEvent[]>([]);
  const [creditCardPayments, setCreditCardPayments] = useState<CreditCardPayment[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [monthAmountsLoading, setMonthAmountsLoading] = useState(true);
  const [monthBalances, setMonthBalances] = useState<Record<string, number>>({});
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);
  const [clearAfterConfirm, setClearAfterConfirm] = useState(false);
  const [spendLogTarget, setSpendLogTarget] = useState<SpendLogTarget | null>(null);
  const [spendLogDraft, setSpendLogDraft] = useState<SpendLogDraft>(BLANK_SPEND_LOG);
  const [showCashEventForm, setShowCashEventForm] = useState(false);
  const [editingCashEventId, setEditingCashEventId] = useState<string | null>(null);
  const [cashEventDraft, setCashEventDraft] = useState({ name: "", amount: "", date: todayISODate(), direction: "outflow" as "inflow" | "outflow", notes: "" });
  const [editingPayment, setEditingPayment] = useState<CreditCardPayment | null>(null);
  const [paymentDraft, setPaymentDraft] = useState({ amount: "", scheduledDate: todayISODate(), notes: "" });

  // Legacy closed week/month data is retained for carrying existing anchors forward.
  const [closedWeeks, setClosedWeeks] = useState<Set<string>>(new Set());
  const [closedMonths, setClosedMonths] = useState<Set<string>>(new Set());
  const [activeWeekIdx, setActiveWeekIdx] = useState(0);
  const anchorSaveSeq = useRef(0);
  const anchorDraftRef = useRef("");
  const anchorDirtyRef = useRef(false);
  const anchorSavePromiseRef = useRef<Promise<void>>(Promise.resolve());
  const amountsMonthKeyRef = useRef("");
  const [amountsMonthKey, setAmountsMonthKey] = useState("");
  const amountEditVersionsRef = useRef<Record<string, number>>({});
  const monthlyAmountSnapshotsRef = useRef<Record<string, Record<string, Record<number, number>>>>({});
  const monthlyAmountSaveChainsRef = useRef<Record<string, Promise<void>>>({});
  const monthlyAmountSaveTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Used by the legacy spend log modal until spend logging is fully native.
  const cardLookup = useMemo(
    () => Object.fromEntries((settings?.creditCards ?? []).map((c) => [c.id, c.label])),
    [settings]
  );

  // ── All derived month keys ────────────────────────────────────────────────
  const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prevMonthKey = month === 0
    ? `${year - 1}-12`
    : `${year}-${String(month).padStart(2, "0")}`;
  const monthName = new Date(year, month).toLocaleString("en-US", { month: "long", year: "numeric" });
  const monthLabel = new Date(year, month).toLocaleString("en-US", { month: "long" });
  const prevDate = month === 0
    ? new Date(year - 1, 11, 1)
    : new Date(year, month - 1, 1);
  const oneMonthAgo = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const canGoPrevMonth = prevDate >= oneMonthAgo;
  const isMonthClosed = closedMonths.has(monthKey);
  const isMonthAmountsPending = monthAmountsLoading || amountsMonthKey !== monthKey;

  function getAmountEditVersion(key: string) {
    return amountEditVersionsRef.current[key] ?? 0;
  }

  function bumpAmountEditVersion(key: string) {
    amountEditVersionsRef.current[key] = getAmountEditVersion(key) + 1;
    return amountEditVersionsRef.current[key];
  }

  function setMonthAmountsState(key: string, nextAmounts: Record<string, Record<number, number>>) {
    amountsMonthKeyRef.current = key;
    monthlyAmountSnapshotsRef.current[key] = nextAmounts;
    setAmountsMonthKey(key);
    setAmounts(nextAmounts);
    setMonthAmountsLoading(false);
  }

  async function flushMonthlyAmountsSave(key: string, requestedVersion?: number) {
    const previousSave = monthlyAmountSaveChainsRef.current[key] ?? Promise.resolve();
    const savePromise = previousSave
      .catch(() => undefined)
      .then(async () => {
        const latestVersion = getAmountEditVersion(key);
        if (requestedVersion !== undefined && requestedVersion < latestVersion) {
          queueMonthlyAmountsSave(key, 0);
          return;
        }

        const snapshot = monthlyAmountSnapshotsRef.current[key] ?? {};
        try {
          await budgetRepo.saveMonthlyAmounts(key, snapshot);
        } catch (error) {
          console.error("[Dock] Failed to save monthly amounts", {
            monthKey: key,
            error,
          });
        }
      });

    monthlyAmountSaveChainsRef.current[key] = savePromise.then(
      () => undefined,
      () => undefined,
    );
    await savePromise;
  }

  function queueMonthlyAmountsSave(key: string, delayMs = 350) {
    const existingTimer = monthlyAmountSaveTimersRef.current[key];
    if (existingTimer) clearTimeout(existingTimer);

    const requestedVersion = getAmountEditVersion(key);
    monthlyAmountSaveTimersRef.current[key] = setTimeout(() => {
      delete monthlyAmountSaveTimersRef.current[key];
      void flushMonthlyAmountsSave(key, requestedVersion);
    }, delayMs);
  }

  // Load on mount
  useEffect(() => {
    let cancelled = false;

    async function loadInitialData() {
      const [s, savedAmounts, savedMonthBalances, savedAnchorOverride, savedClosedMonths, savedClosedWeeks, savedSpendLogs, savedActualTransactions, savedBudgetItems, savedCashFlowEvents, savedCreditCardPayments] = await Promise.all([
        loadSettingsWithSupabaseFallback(),
        budgetRepo.getMonthlyAmounts(monthKey),
        budgetRepo.getMonthBalances(),
        budgetRepo.getAnchorOverride(),
        budgetRepo.getClosedMonths(),
        budgetRepo.getClosedWeeks(monthKey),
        budgetRepo.getSpendLogs(monthKey),
        budgetRepo.getActualTransactions(),
        budgetRepo.getBudgetItems(),
        budgetRepo.getCashFlowEvents(),
        budgetRepo.getCreditCardPayments(),
      ]);
      if (cancelled) return;
      if (!s) { router.push("/setup"); return; }
      const initialWeeks = getWeekRanges(year, month);
      const initialAmounts = buildProjectedAmounts(
        s,
        initialWeeks,
        month,
        savedAmounts,
        closedWeekIndexesFromKeys(monthKey, savedClosedWeeks),
      );

      setSettings(s);
      setCurrentBalance(savedAnchorOverride ?? "");
      const nextAnchorDraft = savedAnchorOverride === null ? "" : String(savedAnchorOverride);
      anchorDraftRef.current = nextAnchorDraft;
      anchorDirtyRef.current = false;
      setAnchorDraft(nextAnchorDraft);
      setMonthAmountsState(monthKey, initialAmounts);
      setSpendLogs(savedSpendLogs);
      setActualTransactions(savedActualTransactions);
      setNativeBudgetItems(savedBudgetItems);
      setCashFlowEvents(savedCashFlowEvents);
      setCreditCardPayments(savedCreditCardPayments);
      setMonthBalances(savedMonthBalances);
      setClosedMonths(savedClosedMonths);
      setClosedWeeks(savedClosedWeeks);
      setLoaded(true);
    }

    loadInitialData();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      Object.values(monthlyAmountSaveTimersRef.current).forEach(clearTimeout);
    };
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;

    (window as typeof window & { harborRecurrenceScenarios?: typeof recurrenceDebugScenarios }).harborRecurrenceScenarios = recurrenceDebugScenarios;
  }, []);

  useEffect(() => {
    if (!loaded) return;
    let cancelled = false;

    void budgetRepo.getAnchorOverride().then((savedAnchorOverride) => {
      if (!cancelled) {
        setCurrentBalance(savedAnchorOverride ?? "");
        const nextAnchorDraft = savedAnchorOverride === null ? "" : String(savedAnchorOverride);
        anchorDraftRef.current = nextAnchorDraft;
        anchorDirtyRef.current = false;
        setAnchorDraft(nextAnchorDraft);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [loaded, monthKey]);

  // Save the visible month's amounts after edits settle.
  useEffect(() => {
    if (!loaded || isMonthClosed || amountsMonthKey !== monthKey) return;
    monthlyAmountSnapshotsRef.current[monthKey] = amounts;
    queueMonthlyAmountsSave(monthKey);
  }, [amounts, amountsMonthKey, loaded, isMonthClosed, monthKey]);

  const weeks = useMemo(() => getWeekRanges(year, month), [year, month]);

  // Auto fill defaults on load
  useEffect(() => {
    if (!settings || !loaded) return;
    let cancelled = false;
    const currentMonthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
    const loadStartedAtVersion = getAmountEditVersion(currentMonthKey);
    const hasLoadedVisibleMonth =
      amountsMonthKeyRef.current === currentMonthKey
      && monthlyAmountSnapshotsRef.current[currentMonthKey] !== undefined;

    if (!hasLoadedVisibleMonth) {
      void Promise.resolve().then(() => {
        if (!cancelled) setMonthAmountsLoading(true);
      });
    }

    void Promise.all([
      budgetRepo.getMonthlyAmounts(currentMonthKey),
      budgetRepo.getClosedWeeks(currentMonthKey),
      budgetRepo.getSpendLogs(currentMonthKey),
      budgetRepo.getActualTransactions(),
      budgetRepo.getBudgetItems(),
      budgetRepo.getCashFlowEvents(),
      budgetRepo.getCreditCardPayments(),
    ]).then(([saved, savedClosedWeeks, savedSpendLogs, savedActualTransactions, savedBudgetItems, savedCashFlowEvents, savedCreditCardPayments]) => {
      if (cancelled) return;

      setClosedWeeks(savedClosedWeeks);
      setSpendLogs(savedSpendLogs);
      setActualTransactions(savedActualTransactions);
      setNativeBudgetItems(savedBudgetItems);
      setCashFlowEvents(savedCashFlowEvents);
      setCreditCardPayments(savedCreditCardPayments);

      const next = buildProjectedAmounts(
        settings,
        weeks,
        month,
        saved,
        closedWeekIndexesFromKeys(currentMonthKey, savedClosedWeeks),
      );
      if (getAmountEditVersion(currentMonthKey) !== loadStartedAtVersion) {
        const localEdits = monthlyAmountSnapshotsRef.current[currentMonthKey] ?? {};
        setMonthAmountsState(currentMonthKey, {
          ...next,
          ...Object.fromEntries(
            Object.entries(localEdits).map(([itemId, byWeek]) => [
              itemId,
              { ...(next[itemId] ?? {}), ...byWeek },
            ]),
          ),
        });
        return;
      }

      setMonthAmountsState(currentMonthKey, next);
    });

    return () => {
      cancelled = true;
    };
  }, [year, month, settings, loaded]);

  // Auto-set active week to current week on mobile
  useEffect(() => {
    if (weeks.length === 0) return;
    const today = new Date();
    const nextActiveWeekIdx =
      year === today.getFullYear() && month === today.getMonth()
        ? weeks.findIndex((w) => today >= w.start && today <= w.end)
        : -1;

    void Promise.resolve().then(() => {
      setActiveWeekIdx(nextActiveWeekIdx >= 0 ? nextActiveWeekIdx : 0);
    });
  }, [year, month, weeks.length]);

  const currentAnchor = currentBalance !== ""
    ? currentBalance
    : settings?.checkingBalance ?? 0;

  const visibleAmounts = useMemo(
    () => (isMonthAmountsPending ? {} : amounts),
    [amounts, isMonthAmountsPending],
  );

  const spendLogsByRippleWeek = useMemo(() => {
    const result: Record<string, SpendLogEntry[]> = {};
    spendLogs.forEach((entry) => {
      const key = `${entry.rippleId}-${entry.weekIndex}`;
      result[key] = result[key] ?? [];
      result[key].push(entry);
    });
    return result;
  }, [spendLogs]);
  const flexibleSpendItems = useMemo(() => (
    settings?.lineItems.filter((item) => getItemBehavior(item) === "flexible_spend") ?? []
  ), [settings]);

  const forecastAmounts = useMemo(() => {
    if (!settings) return visibleAmounts;

    return settings.lineItems.reduce<Record<string, Record<number, number>>>((nextAmounts, item) => {
      if (getItemBehavior(item) !== "flexible_spend") return nextAmounts;

      const nextByWeek = { ...(nextAmounts[item.id] ?? {}) };
      weeks.forEach((_, weekIndex) => {
        const planned = Number(visibleAmounts[item.id]?.[weekIndex] ?? 0);
        const spent = spendLogsByRippleWeek[`${item.id}-${weekIndex}`]?.reduce((sum, entry) => sum + entry.amount, 0) ?? 0;
        nextByWeek[weekIndex] = Math.max(planned, spent);
      });

      return { ...nextAmounts, [item.id]: nextByWeek };
    }, visibleAmounts);
  }, [settings, spendLogsByRippleWeek, visibleAmounts, weeks]);

  const forecast = useMemo(() => {
    if (!settings) {
      return null;
    }

    return buildMonthForecast({
      settings,
      amounts: forecastAmounts,
      weeks,
      month,
      monthKey,
      currentMonthKey,
      prevMonthKey,
      currentAnchor,
      monthBalances,
      closedWeeks,
      isMonthClosed,
    });
  }, [
    settings,
    forecastAmounts,
    weeks,
    month,
    monthKey,
    currentMonthKey,
    prevMonthKey,
    currentAnchor,
    monthBalances,
    closedWeeks,
    isMonthClosed,
  ]);

  const startingBalance = forecast?.startingBalance ?? currentAnchor;
  const projectedForwardBalance = forecast?.projectedForwardBalance ?? startingBalance;
  const displayedForwardBalance = forecast?.displayedForwardBalance ?? projectedForwardBalance;
  const balanceLabel = forecast?.balanceLabel ?? (isMonthClosed ? "Final Checking Cash" : "Projected Checking Cash");
  const isProjectedBalanceLoading = !isMonthClosed && isMonthAmountsPending;
  const monthStartDate = `${monthKey}-01`;
  const monthEndDate = [
    year,
    String(month + 1).padStart(2, "0"),
    String(new Date(year, month + 1, 0).getDate()).padStart(2, "0"),
  ].join("-");

  const paymentAccountsForForecast = useMemo<PaymentAccount[]>(() => {
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
        currentBalance: 0,
        statementCloseDay: card.statementClosingDay,
        statementClosingDay: card.statementClosingDay,
        active: true,
        sortOrder: index + 1,
      })),
    ];
  }, [currentAnchor, settings]);

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

  const legacyBudgetItemsForForecast = useMemo<BudgetItem[]>(() => {
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

  const budgetItemsForForecast = useMemo<BudgetItem[]>(() => {
    const nativeLegacyIds = new Set(nativeBudgetItems.map((item) => item.legacyLineItemId).filter(Boolean));
    return [
      ...nativeBudgetItems,
      ...legacyBudgetItemsForForecast.filter((item) => !nativeLegacyIds.has(item.legacyLineItemId)),
    ];
  }, [legacyBudgetItemsForForecast, nativeBudgetItems]);

  const cashProjectionBudgetItems = useMemo<BudgetItem[]>(() => {
    if (!settings) return [];
    const nativeLegacyIds = new Set(nativeBudgetItems.map((item) => item.legacyLineItemId).filter(Boolean));
    const legacyItems = settings.lineItems.flatMap((item) => {
      if (nativeLegacyIds.has(item.id)) return [];
      if (item.isIncome || item.paymentMethod !== "checking") return [];
      return weeks.flatMap((week, weekIndex) => {
        if (!lineItemAppliesToWeek(item, weekIndex, week.start, week.end, month)) return [];
        const amount = forecastAmounts[item.id]?.[weekIndex] ?? 0;
        if (amount <= 0) return [];
        const date = [
          week.start.getFullYear(),
          String(week.start.getMonth() + 1).padStart(2, "0"),
          String(week.start.getDate()).padStart(2, "0"),
        ].join("-");
        return {
          id: `${item.id}-${weekIndex}`,
          categoryId: item.category,
          categoryName: item.category,
          name: item.name,
          amount,
          recurrenceType: "legacy-week",
          recurrenceConfig: { date },
          defaultPaymentAccountId: item.paymentMethod,
          defaultCashAccountId: "checking",
          paymentMethod: "checking",
          active: true,
          legacyLineItemId: item.id,
        } satisfies BudgetItem;
      });
    });
    const nativeItems = nativeBudgetItems
      .filter((item) => item.active && (item.paymentMethod === "checking" || item.paymentMethod === "cash"))
      .map((item) => ({
        ...item,
        defaultCashAccountId: item.defaultCashAccountId ?? "checking",
      }));
    return [...legacyItems, ...nativeItems];
  }, [forecastAmounts, month, nativeBudgetItems, settings, weeks]);

  const projectedIncomeCashEvents = useMemo<CashFlowEvent[]>(() => {
    if (!settings) return [];
    return settings.lineItems.flatMap((item) => {
      if (!item.isIncome) return [];
      return weeks.flatMap((week, weekIndex) => {
        if (!lineItemAppliesToWeek(item, weekIndex, week.start, week.end, month)) return [];
        const amount = forecastAmounts[item.id]?.[weekIndex] ?? 0;
        if (amount <= 0) return [];
        const date = [
          week.start.getFullYear(),
          String(week.start.getMonth() + 1).padStart(2, "0"),
          String(week.start.getDate()).padStart(2, "0"),
        ].join("-");
        return {
          id: `income-${item.id}-${weekIndex}`,
          date,
          amount,
          direction: "inflow",
          cashAccountId: "checking",
          name: item.name,
          category: "Income",
          status: "projected",
        } satisfies CashFlowEvent;
      });
    });
  }, [forecastAmounts, month, settings, weeks]);

  const budgetForecast = useMemo(() => buildBudgetForecast({
    budgetItems: budgetItemsForForecast,
    transactions: currentMonthActualTransactions,
    categories: settings?.categories.map((category) => ({ id: category, name: category })) ?? [],
    startDate: monthStartDate,
    endDate: monthEndDate,
  }), [budgetItemsForForecast, currentMonthActualTransactions, monthEndDate, monthStartDate, settings]);

  const cashFlowForecast = useMemo(() => buildCashFlowForecast({
    startingBalance,
    cashAccountId: "checking",
    accounts: paymentAccountsForForecast,
    transactions: currentMonthActualTransactions,
    cashFlowEvents: [...cashFlowEvents, ...projectedIncomeCashEvents],
    creditCardPayments,
    budgetItems: cashProjectionBudgetItems,
    startDate: monthStartDate,
    endDate: monthEndDate,
  }), [cashFlowEvents, cashProjectionBudgetItems, creditCardPayments, currentMonthActualTransactions, monthEndDate, monthStartDate, paymentAccountsForForecast, projectedIncomeCashEvents, startingBalance]);

  function getSpendEntries(itemId: string, weekIndex: number) {
    return spendLogsByRippleWeek[`${itemId}-${weekIndex}`] ?? [];
  }

  // Keep the legacy month-balance adapter in sync for historical closed months.
  useEffect(() => {
    if (!loaded || isMonthClosed || isMonthAmountsPending || !forecast) return;
    const endingBalance = forecast.endingBalance;
    void Promise.resolve().then(() => {
      setMonthBalances((prev) => (
        prev[monthKey] === endingBalance ? prev : { ...prev, [monthKey]: endingBalance }
      ));
    });
    void budgetRepo.saveMonthBalance(monthKey, endingBalance);
  }, [forecast, loaded, monthKey, isMonthClosed, isMonthAmountsPending]);

  function openGlobalSpendLog() {
    const fallbackItem = flexibleSpendItems.find((item) => (
      lineItemAppliesToWeek(item, activeWeekIdx, weeks[activeWeekIdx]?.start, weeks[activeWeekIdx]?.end, month)
    )) ?? flexibleSpendItems[0];

    setSpendLogTarget({ source: "global" });
    setSpendLogDraft({
      ...BLANK_SPEND_LOG,
      rippleId: fallbackItem?.id ?? "",
      weekIndex: activeWeekIdx,
      paymentMethod: fallbackItem?.paymentMethod ?? "checking",
      date: todayISODate(),
    });
  }

  function closeSpendLogDialog() {
    setSpendLogTarget(null);
    setSpendLogDraft(BLANK_SPEND_LOG);
  }

  async function saveSpendLog() {
    if (!spendLogTarget) return;
    const selectedItem = flexibleSpendItems.find((item) => item.id === spendLogDraft.rippleId);
    if (!selectedItem) return;
    const amount = Number(spendLogDraft.amount);
    if (!Number.isFinite(amount) || amount <= 0) return;

    const now = new Date().toISOString();
    const savedEntry = await budgetRepo.saveSpendLog({
      id: crypto.randomUUID(),
      monthKey,
      weekIndex: spendLogDraft.weekIndex,
      rippleId: selectedItem.id,
      amount,
      paymentMethod: spendLogDraft.paymentMethod,
      date: spendLogDraft.date || todayISODate(),
      note: spendLogDraft.note.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    });

    setSpendLogs((current) => [...current, savedEntry]);
    await budgetRepo.saveActualTransaction({
      id: savedEntry.id,
      date: savedEntry.date,
      merchant: selectedItem.name,
      amount: savedEntry.amount,
      categoryId: selectedItem.category,
      categoryName: selectedItem.category,
      accountId: savedEntry.paymentMethod,
      paymentMethod: savedEntry.paymentMethod === "checking" ? "checking" : "credit_card",
      notes: savedEntry.note,
      source: "manual",
      plannedItemId: selectedItem.id,
      legacySpendLogId: savedEntry.id,
      createdAt: savedEntry.createdAt,
      updatedAt: savedEntry.updatedAt,
    });
    setSpendLogDraft({
      ...BLANK_SPEND_LOG,
      rippleId: selectedItem.id,
      weekIndex: spendLogDraft.weekIndex,
      paymentMethod: spendLogDraft.paymentMethod,
      date: spendLogDraft.date || todayISODate(),
    });
  }

  async function deleteSpendLog(entry: SpendLogEntry) {
    await budgetRepo.deleteSpendLog(entry.monthKey, entry.id);
    await budgetRepo.deleteActualTransaction(entry.id);
    setSpendLogs((current) => current.filter((item) => item.id !== entry.id));
  }

  async function scheduleCreditCardPayment(payment: CreditCardPayment) {
    const savedPayment = await budgetRepo.saveCreditCardPayment(payment);
    setCreditCardPayments((current) => {
      const without = current.filter((item) => item.id !== savedPayment.id);
      return [...without, savedPayment].sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
    });
    setEditingPayment(null);
  }

  async function saveCashEvent() {
    const amount = Number(cashEventDraft.amount);
    if (!cashEventDraft.name.trim() || !cashEventDraft.date || !Number.isFinite(amount) || amount <= 0) return;

    const savedEvent = await budgetRepo.saveCashFlowEvent({
      id: editingCashEventId ?? crypto.randomUUID(),
      date: cashEventDraft.date,
      amount,
      direction: cashEventDraft.direction,
      cashAccountId: "checking",
      name: cashEventDraft.name.trim(),
      category: "One-time cash event",
      status: "scheduled",
    });

    setCashFlowEvents((current) => {
      const without = current.filter((item) => item.id !== savedEvent.id);
      return [...without, savedEvent].sort((a, b) => a.date.localeCompare(b.date));
    });
    setCashEventDraft({ name: "", amount: "", date: todayISODate(), direction: "outflow", notes: "" });
    setEditingCashEventId(null);
    setShowCashEventForm(false);
  }

  function editCashEvent(eventId: string) {
    const event = cashFlowEvents.find((item) => item.id === eventId);
    if (!event) return;
    setEditingCashEventId(event.id);
    setCashEventDraft({
      name: event.name,
      amount: String(event.amount),
      date: event.date,
      direction: event.direction,
      notes: "",
    });
    setShowCashEventForm(true);
  }

  async function updateCashEventStatus(eventId: string, status: CashFlowEvent["status"]) {
    const event = cashFlowEvents.find((item) => item.id === eventId);
    if (!event) return;
    const savedEvent = await budgetRepo.saveCashFlowEvent({ ...event, status });
    setCashFlowEvents((current) => current.map((item) => item.id === savedEvent.id ? savedEvent : item));
  }

  async function deleteCashEvent(eventId: string) {
    await budgetRepo.deleteCashFlowEvent(eventId);
    setCashFlowEvents((current) => current.filter((item) => item.id !== eventId));
  }

  function editCreditCardPayment(payment: CreditCardPayment) {
    setEditingPayment(payment);
    setPaymentDraft({
      amount: String(payment.amount),
      scheduledDate: payment.scheduledDate,
      notes: payment.notes ?? "",
    });
  }

  async function saveEditedCreditCardPayment(status?: CreditCardPayment["status"]) {
    if (!editingPayment) return;
    const amount = Number(paymentDraft.amount);
    if (!Number.isFinite(amount) || amount <= 0 || !paymentDraft.scheduledDate) return;
    await scheduleCreditCardPayment({
      ...editingPayment,
      amount,
      scheduledDate: paymentDraft.scheduledDate,
      notes: paymentDraft.notes.trim() || undefined,
      status: status ?? editingPayment.status,
    });
  }

  async function markCreditCardPayment(payment: CreditCardPayment, status: CreditCardPayment["status"]) {
    await scheduleCreditCardPayment({ ...payment, status });
    if (status === "paid") {
      const linkedEvents = cashFlowEvents.filter((event) => event.linkedCreditCardPaymentId === payment.id);
      await Promise.all(linkedEvents.map((event) => updateCashEventStatus(event.id, "cleared")));
    }
  }

  async function deleteCreditCardPayment(payment: CreditCardPayment) {
    await budgetRepo.deleteCreditCardPayment(payment.id);
    setCreditCardPayments((current) => current.filter((item) => item.id !== payment.id));
    if (editingPayment?.id === payment.id) setEditingPayment(null);
  }

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

  function changeAnchorDraft(value: string) {
    anchorDraftRef.current = value;
    anchorDirtyRef.current = true;
    setAnchorDraft(value);
  }

  function openAnchorEditor() {
    const draft = String(currentAnchor);
    anchorDraftRef.current = draft;
    anchorDirtyRef.current = false;
    setAnchorDraft(draft);
    setIsEditingAnchor(true);
  }

  function cancelAnchorEdit() {
    const draft = currentBalance === "" ? "" : String(currentBalance);
    anchorDraftRef.current = draft;
    anchorDirtyRef.current = false;
    setAnchorDraft(draft);
    setIsEditingAnchor(false);
  }

  async function saveAnchorEdit() {
    if (anchorDirtyRef.current) {
      await commitAnchorOverride();
    }
    setIsEditingAnchor(false);
  }

  async function clearAnchorOverride() {
    anchorDraftRef.current = "";
    anchorDirtyRef.current = true;
    setAnchorDraft("");
    await commitAnchorOverride();
    setIsEditingAnchor(false);
  }

  async function commitAnchorOverride(commitMonthKey = monthKey) {
    if (!anchorDirtyRef.current) return;

    const draft = anchorDraftRef.current.trim();
    const parsed = draft === "" ? null : Number(draft);
    if (parsed !== null && Number.isNaN(parsed)) return;

    const next = parsed ?? "";
    const saveSeq = ++anchorSaveSeq.current;

    setCurrentBalance(next);
    anchorDirtyRef.current = false;

    const previousSave = anchorSavePromiseRef.current;
    const savePromise = previousSave.then(() => budgetRepo.saveAnchorOverride(parsed));
    anchorSavePromiseRef.current = savePromise.then(
      () => undefined,
      () => undefined,
    );
    const saved = await savePromise;

    if (saveSeq === anchorSaveSeq.current && commitMonthKey === monthKey) {
      setCurrentBalance(saved ?? "");
      setSettings((prev) => prev ? { ...prev, checkingBalance: saved ?? 0 } : prev);
      const savedDraft = saved === null ? "" : String(saved);
      anchorDraftRef.current = savedDraft;
      setAnchorDraft(savedDraft);
    }
  }

  async function navigateAfterAnchorCommit(event: MouseEvent<HTMLAnchorElement>, href: string) {
    if (!anchorDirtyRef.current) return;

    event.preventDefault();
    await commitAnchorOverride();
    router.push(href);
  }

async function prevMonth() {
    await commitAnchorOverride();
    if (!canGoPrevMonth) return; // block going too far back
    if (month === 0) { setMonth(11); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  }
  async function nextMonth() {
    await commitAnchorOverride();
    if (month === 11) { setMonth(0); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  }

  function openCloseMonthDialog() {
    if (isMonthClosed || isMonthAmountsPending) return;
    setClearAfterConfirm(false);
    setPendingConfirmation({ type: "close-month" });
  }

  function closeConfirmationDialog() {
    setPendingConfirmation(null);
    setClearAfterConfirm(false);
  }

  async function confirmPendingAction() {
    const pending = pendingConfirmation;
    const shouldClear = clearAfterConfirm;
    if (!pending) return;
    closeConfirmationDialog();
    await closeMonth(shouldClear);
  }

  async function closeMonth(clearValues: boolean) {
    if (isMonthAmountsPending) return;
    const savedClosedMonths = await budgetRepo.closeMonth(monthKey, projectedForwardBalance);
    setClosedMonths(savedClosedMonths);
    setMonthBalances((prev) => ({ ...prev, [monthKey]: projectedForwardBalance }));
    if (clearValues) {
      bumpAmountEditVersion(monthKey);
      setMonthAmountsState(monthKey, {});
      const existingTimer = monthlyAmountSaveTimersRef.current[monthKey];
      if (existingTimer) {
        clearTimeout(existingTimer);
        delete monthlyAmountSaveTimersRef.current[monthKey];
      }
      await (monthlyAmountSaveChainsRef.current[monthKey] ?? Promise.resolve()).catch(() => undefined);
      await budgetRepo.clearMonthlyAmounts(monthKey);
      monthlyAmountSnapshotsRef.current[monthKey] = {};
    }
  }

  async function reopenMonth() {
    const confirmed = window.confirm(`Reopen ${monthName}? This will allow edits again.`);
    if (!confirmed) return;

    const savedClosedMonths = await budgetRepo.reopenMonth(monthKey);
    setClosedMonths(savedClosedMonths);
  }

  if (!loaded || !settings) {
    return (
      <main className="flex-1 bg-harbor-offwhite flex items-center justify-center">
        <HarborSpinner label="Dropping anchor..." />
      </main>
    );
  }

  const selectedSpendItem = flexibleSpendItems.find((item) => item.id === spendLogDraft.rippleId);
  const selectedSpendWeek = weeks[spendLogDraft.weekIndex] ?? weeks[activeWeekIdx];

  return (
    <main className="flex-1 bg-harbor-offwhite text-slate-900 p-4">
      <div className="max-w-[1400px] mx-auto space-y-4">

        {/* Page controls */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-harbor-teal-light space-y-3">

          {/* Row 1: Month nav + quick-add */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <button
                onClick={prevMonth}
                disabled={!canGoPrevMonth}
                aria-label="Previous month"
                className="w-9 h-9 flex items-center justify-center rounded-lg bg-harbor-teal-light hover:bg-harbor-teal/20 text-harbor-navy font-bold transition-colors disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-300 disabled:hover:bg-slate-100"
              >
                ←
              </button>
              <span className="font-bold text-base md:text-lg w-44 text-center text-harbor-navy">{monthName}</span>
              <button
                onClick={nextMonth}
                aria-label="Next month"
                className="w-9 h-9 flex items-center justify-center rounded-lg bg-harbor-teal-light hover:bg-harbor-teal/20 text-harbor-navy font-bold transition-colors"
              >
                →
              </button>
            </div>

            <div className="flex items-center gap-2">
              <Link
                href="/settings#waves"
                aria-disabled={isMonthClosed}
                onClick={(e) => {
                  if (isMonthClosed) {
                    e.preventDefault();
                    return;
                  }
                  void navigateAfterAnchorCommit(e, "/settings#waves");
                }}
                className={`flex items-center gap-1 px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${
                  isMonthClosed
                    ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-300"
                    : "border-harbor-green/30 bg-harbor-green/5 text-harbor-green hover:bg-harbor-green/10"
                }`}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                Add Wave
              </Link>
              <Link
                href="/settings#ripples"
                aria-disabled={isMonthClosed}
                onClick={(e) => {
                  if (isMonthClosed) {
                    e.preventDefault();
                    return;
                  }
                  void navigateAfterAnchorCommit(e, "/settings#ripples");
                }}
                className={`flex items-center gap-1 px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${
                  isMonthClosed
                    ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-300"
                    : "border-harbor-red/30 bg-harbor-red/5 text-harbor-red hover:bg-harbor-red/10"
                }`}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                Add Ripple
              </Link>
              {isMonthClosed ? (
                <button
                  type="button"
                  onClick={() => void reopenMonth()}
                  className="px-3 py-2 rounded-lg border border-harbor-teal/30 bg-harbor-teal-light text-harbor-navy text-xs font-medium hover:bg-harbor-teal/20 transition-colors"
                >
                  Reopen Month
                </button>
              ) : (
                <button
                  type="button"
                  onClick={openCloseMonthDialog}
                  title={helpCopy.closeMonth.body}
                  className="px-3 py-2 rounded-lg border border-harbor-navy/20 bg-harbor-navy text-white text-xs font-medium hover:bg-harbor-navy/90 transition-colors"
                >
                  Close Month
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 bg-white/70 px-3 py-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-harbor-navy/45">Quick actions</span>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={openGlobalSpendLog}
                disabled={isMonthClosed || flexibleSpendItems.length === 0}
                className="px-3 py-1.5 rounded-lg border border-harbor-red/25 bg-white text-harbor-red text-xs font-medium hover:bg-harbor-red/5 transition-colors disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-300"
              >
                Log Spend
              </button>
            </div>
          </div>

          {isMonthClosed && (
            <div className="rounded-xl border border-harbor-teal/20 bg-harbor-teal-light px-4 py-3">
              <p className="text-sm font-semibold text-harbor-navy">{monthLabel} is closed</p>
              <p className="text-xs text-harbor-navy/60">
                Closed months are read-only so Harbor can carry balances forward cleanly.
              </p>
            </div>
          )}

          {weeks.length > 0 && (
            <div className="md:hidden flex items-center justify-between bg-harbor-navy text-white rounded-2xl px-4 py-3 shadow-sm">
              <button
                type="button"
                onClick={() => setActiveWeekIdx((i) => Math.max(0, i - 1))}
                disabled={activeWeekIdx === 0}
                aria-label="Previous week"
                className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-30 font-bold transition-colors text-[0px]"
              >
                <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
                â†
              </button>
              <div className="text-center">
                <div className="text-xs opacity-60">Week {activeWeekIdx + 1} of {weeks.length}</div>
                <div className="text-sm font-medium">{weeks[activeWeekIdx].label}</div>
              </div>
              <button
                type="button"
                onClick={() => setActiveWeekIdx((i) => Math.min(weeks.length - 1, i + 1))}
                disabled={activeWeekIdx === weeks.length - 1}
                aria-label="Next week"
                className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-30 font-bold transition-colors text-[0px]"
              >
                <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 18l6-6-6-6" />
                </svg>
                â†’
              </button>
            </div>
          )}

        </div>

        <InfoCallout id="dock-primer-v1" title="How Dock works">
          Dock is your week-by-week plan. Add Income (Waves) and Bills &amp; Spending (Ripples),
          then wrap a week once it has happened so Harbor stops treating it as pending.
        </InfoCallout>

        {/* Anchor summary */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-harbor-teal-light">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(220px,auto)] md:items-start">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-harbor-navy/45">Current Anchor</p>
                  <HelpTooltip title={helpCopy.currentAnchor.title}>{helpCopy.currentAnchor.body}</HelpTooltip>
                </div>
                <div className={`text-2xl font-bold ${currentAnchor >= 0 ? "text-harbor-green" : "text-harbor-red"}`}>
                  {formatMoney(currentAnchor)}
                </div>
                <p className="max-w-xl text-sm text-harbor-navy/55">
                  Your actual checking balance. Harbor projects forward from here.
                </p>
              </div>

              {!isEditingAnchor && (
                <div className="space-y-1 md:border-l md:border-harbor-teal-light md:pl-4">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-harbor-navy/45">{balanceLabel}</p>
                    <HelpTooltip title={isMonthClosed ? helpCopy.finalBalance.title : helpCopy.projectedBalance.title}>
                      {isMonthClosed ? helpCopy.finalBalance.body : helpCopy.projectedBalance.body}
                    </HelpTooltip>
                  </div>
                  {isProjectedBalanceLoading ? (
                    <div className="mt-1">
                      <HarborSpinner label="Charting balance..." />
                    </div>
                  ) : (
                    <div className={`text-xl font-bold ${displayedForwardBalance >= 0 ? "text-harbor-green" : "text-harbor-red"}`}>
                      {formatMoney(displayedForwardBalance)}
                    </div>
                  )}
                  <p className="max-w-sm text-sm text-harbor-navy/55">
                    {isProjectedBalanceLoading
                      ? "Loading scheduled waves and ripples from Harbor."
                      : isMonthClosed
                      ? "The balance saved when this month was closed."
                      : "Where Harbor expects this month to end after scheduled waves and ripples."}
                  </p>
                </div>
              )}
            </div>

            {isEditingAnchor ? (
              <div className="flex w-full flex-col gap-3 md:w-auto md:min-w-[320px]">
                <label className="text-xs text-slate-400">Current Anchor amount</label>
                <input
                  type="number"
                  inputMode="decimal"
                  className="w-full rounded-lg border-2 border-harbor-teal-light px-3 py-2 text-right font-semibold text-slate-600 transition-colors focus:border-harbor-teal focus:outline-none"
                  value={anchorDraft}
                  onChange={(e) => changeAnchorDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      void saveAnchorEdit();
                    }
                    if (e.key === "Escape") {
                      cancelAnchorEdit();
                    }
                  }}
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void saveAnchorEdit()}
                    className="rounded-lg bg-harbor-teal px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-harbor-teal/90"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={cancelAnchorEdit}
                    className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-harbor-navy/70 transition-colors hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  {currentBalance !== "" && (
                    <button
                      type="button"
                      onClick={() => void clearAnchorOverride()}
                      className="rounded-lg border border-harbor-red/30 px-4 py-2 text-sm font-medium text-harbor-red transition-colors hover:bg-red-50"
                    >
                      Clear Anchor
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={openAnchorEditor}
                disabled={isMonthClosed}
                className="self-start rounded-lg border border-harbor-teal/30 bg-harbor-teal-light px-4 py-2 text-sm font-medium text-harbor-navy transition-colors hover:bg-harbor-teal/20 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-300 disabled:hover:bg-slate-50 md:self-center"
              >
                Edit Anchor
              </button>
            )}
          </div>
        </div>

        {isMonthAmountsPending ? (
          <div className="rounded-2xl border border-harbor-teal-light bg-white p-6 shadow-sm">
            <HarborSpinner label="Loading month..." />
            <div className="mt-5 grid gap-3">
              <div className="h-9 rounded-lg bg-harbor-teal-light/60" />
              <div className="h-9 rounded-lg bg-slate-100" />
              <div className="h-9 rounded-lg bg-slate-100" />
              <div className="h-9 rounded-lg bg-slate-100" />
            </div>
          </div>
        ) : (
          <>
        {settings.lineItems.length === 0 && (
          <EmptyState
            title="No income or spending yet"
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Link href="/settings#waves" className="rounded-lg bg-harbor-green px-3 py-2 text-sm font-medium text-white hover:bg-harbor-green/90">
                  Add Income
                </Link>
                <Link href="/settings#ripples" className="rounded-lg bg-harbor-red px-3 py-2 text-sm font-medium text-white hover:bg-harbor-red/90">
                  Add Spending
                </Link>
              </div>
            }
          >
            Add Income (Waves) and Bills &amp; Spending (Ripples) when you are ready. Harbor can still start from your Current Anchor.
          </EmptyState>
        )}

        <div className="space-y-5">
          {showCashEventForm && (
            <div className="rounded-2xl border border-harbor-teal-light bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-3 md:flex-row md:items-end">
                <div className="flex-1">
                  <label className="mb-1 block text-xs font-medium text-slate-500">Cash event name</label>
                  <input
                    type="text"
                    value={cashEventDraft.name}
                    onChange={(event) => setCashEventDraft((draft) => ({ ...draft, name: event.target.value }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-harbor-navy"
                    placeholder="Paycheck, transfer, one-time bill"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">Direction</label>
                  <select
                    value={cashEventDraft.direction}
                    onChange={(event) => setCashEventDraft((draft) => ({ ...draft, direction: event.target.value as "inflow" | "outflow" }))}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-harbor-navy"
                  >
                    <option value="inflow">Cash inflow</option>
                    <option value="outflow">Cash outflow</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">Checking cash amount</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={cashEventDraft.amount}
                    onChange={(event) => setCashEventDraft((draft) => ({ ...draft, amount: event.target.value }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-harbor-navy"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">Cash movement date</label>
                  <input
                    type="date"
                    value={cashEventDraft.date}
                    onChange={(event) => setCashEventDraft((draft) => ({ ...draft, date: event.target.value }))}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-harbor-navy"
                  />
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => void saveCashEvent()} className="rounded-lg bg-harbor-teal px-4 py-2 text-sm font-medium text-white hover:bg-harbor-teal/90">
                    Save Cash Event
                  </button>
                  <button type="button" onClick={() => {
                    setShowCashEventForm(false);
                    setEditingCashEventId(null);
                    setCashEventDraft({ name: "", amount: "", date: todayISODate(), direction: "outflow", notes: "" });
                  }} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-harbor-navy/60 hover:bg-slate-50">
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          <CashFlowDock
            forecast={cashFlowForecast}
            onAddCashEvent={() => setShowCashEventForm(true)}
            onEditCashEvent={editCashEvent}
            onMarkCashEventCleared={(eventId) => void updateCashEventStatus(eventId, "cleared")}
            onSkipCashEvent={(eventId) => void updateCashEventStatus(eventId, "skipped")}
            onDeleteCashEvent={(eventId) => void deleteCashEvent(eventId)}
          />
          <BudgetForecastPanel forecast={budgetForecast} />
          <BudgetItemManager
            budgetItems={budgetItemsForForecast}
            categories={settings.categories}
            accounts={paymentAccountsForForecast}
            onSave={saveBudgetItem}
            onDeactivate={deactivateBudgetItem}
          />
          {editingPayment && (
            <div className="rounded-2xl border border-harbor-teal-light bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-harbor-teal">Edit Scheduled Payment</p>
              <div className="mt-3 grid gap-3 md:grid-cols-5">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={paymentDraft.amount}
                  onChange={(event) => setPaymentDraft((draft) => ({ ...draft, amount: event.target.value }))}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-harbor-navy"
                />
                <input
                  type="date"
                  value={paymentDraft.scheduledDate}
                  onChange={(event) => setPaymentDraft((draft) => ({ ...draft, scheduledDate: event.target.value }))}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-harbor-navy"
                />
                <input
                  type="text"
                  value={paymentDraft.notes}
                  onChange={(event) => setPaymentDraft((draft) => ({ ...draft, notes: event.target.value }))}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-harbor-navy md:col-span-2"
                  placeholder="Payment notes"
                />
                <button type="button" onClick={() => void saveEditedCreditCardPayment()} className="rounded-lg bg-harbor-teal px-4 py-2 text-sm font-medium text-white hover:bg-harbor-teal/90">
                  Save Payment
                </button>
                <button type="button" onClick={() => void saveEditedCreditCardPayment("paid")} className="rounded-lg border border-harbor-green/25 px-4 py-2 text-sm font-medium text-harbor-green hover:bg-harbor-green/5">
                  Mark Paid
                </button>
                <button type="button" onClick={() => void saveEditedCreditCardPayment("skipped")} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-500 hover:bg-slate-50">
                  Mark Skipped
                </button>
                <button type="button" onClick={() => void deleteCreditCardPayment(editingPayment)} className="rounded-lg border border-harbor-red/25 px-4 py-2 text-sm font-medium text-harbor-red hover:bg-harbor-red/5">
                  Delete Payment
                </button>
                <button type="button" onClick={() => setEditingPayment(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-harbor-navy/60 hover:bg-slate-50">
                  Cancel
                </button>
              </div>
            </div>
          )}
          <CreditCardSummaryPanel
            creditCards={paymentAccountsForForecast.filter((account) => account.type === "credit_card")}
            cashAccounts={paymentAccountsForForecast.filter((account) => account.type === "checking" || account.type === "cash")}
            transactions={currentMonthActualTransactions.filter((transaction) => transaction.paymentMethod === "credit_card")}
            payments={creditCardPayments}
            onSchedulePayment={scheduleCreditCardPayment}
            onEditPayment={editCreditCardPayment}
            onMarkPaymentPaid={(payment) => void markCreditCardPayment(payment, "paid")}
            onMarkPaymentSkipped={(payment) => void markCreditCardPayment(payment, "skipped")}
            onDeletePayment={(payment) => void deleteCreditCardPayment(payment)}
          />
        </div>

          </>
        )}

      </div>


      {spendLogTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-harbor-navy/45 px-4 py-6">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="spend-log-title"
            className="w-full max-w-lg rounded-2xl border border-harbor-teal-light bg-white p-5 shadow-xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-harbor-teal">Log Spend</p>
                <h2 id="spend-log-title" className="mt-1 text-xl font-bold text-harbor-navy">
                  {selectedSpendItem?.name ?? "Flexible spending"}
                </h2>
                <p className="mt-1 text-sm text-harbor-navy/55">
                  {selectedSpendWeek ? `Week ${spendLogDraft.weekIndex + 1} - ${selectedSpendWeek.label}` : "Choose where this spend belongs"}
                </p>
              </div>
              <button
                type="button"
                onClick={closeSpendLogDialog}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-harbor-navy/60 hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Spending area</label>
                <select
                  value={spendLogDraft.rippleId}
                  onChange={(e) => {
                    const nextItem = flexibleSpendItems.find((item) => item.id === e.target.value);
                    setSpendLogDraft((draft) => ({
                      ...draft,
                      rippleId: e.target.value,
                      paymentMethod: nextItem?.paymentMethod ?? draft.paymentMethod,
                    }));
                  }}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-harbor-navy focus:border-harbor-teal focus:outline-none"
                  autoFocus
                >
                  {flexibleSpendItems.length === 0 ? (
                    <option value="">No flexible spending set up</option>
                  ) : (
                    flexibleSpendItems.map((item) => (
                      <option key={item.id} value={item.id}>{item.name}</option>
                    ))
                  )}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Week</label>
                <select
                  value={spendLogDraft.weekIndex}
                  onChange={(e) => setSpendLogDraft((draft) => ({ ...draft, weekIndex: Number(e.target.value) }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-harbor-navy focus:border-harbor-teal focus:outline-none"
                >
                  {weeks.map((week, weekIndex) => (
                    <option key={weekIndex} value={weekIndex}>
                      Week {weekIndex + 1} - {week.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Amount</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={spendLogDraft.amount}
                    onChange={(e) => setSpendLogDraft((draft) => ({ ...draft, amount: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 py-2 pl-7 pr-3 text-sm text-harbor-navy focus:border-harbor-teal focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Payment method</label>
                <select
                  value={spendLogDraft.paymentMethod}
                  onChange={(e) => setSpendLogDraft((draft) => ({ ...draft, paymentMethod: e.target.value as PaymentMethod }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-harbor-navy focus:border-harbor-teal focus:outline-none"
                >
                  <option value="checking">Checking / Anchor</option>
                  {settings.creditCards.map((card) => (
                    <option key={card.id} value={card.id}>{card.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Date</label>
                <input
                  type="date"
                  value={spendLogDraft.date}
                  onChange={(e) => setSpendLogDraft((draft) => ({ ...draft, date: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-harbor-navy focus:border-harbor-teal focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Note</label>
                <input
                  type="text"
                  value={spendLogDraft.note}
                  onChange={(e) => setSpendLogDraft((draft) => ({ ...draft, note: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-harbor-navy focus:border-harbor-teal focus:outline-none"
                  placeholder="Optional"
                />
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => void saveSpendLog()}
                disabled={!selectedSpendItem}
                className="rounded-lg bg-harbor-red px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-harbor-red/90 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
              >
                Log Spend
              </button>
            </div>

            <div className="mt-5 border-t border-slate-100 pt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-harbor-navy/45">Logged Spend</p>
              <div className="mt-2 max-h-52 overflow-y-auto divide-y divide-slate-100">
                {!selectedSpendItem || getSpendEntries(selectedSpendItem.id, spendLogDraft.weekIndex).length === 0 ? (
                  <p className="py-3 text-sm text-harbor-navy/45">No spend logged yet.</p>
                ) : (
                  getSpendEntries(selectedSpendItem.id, spendLogDraft.weekIndex).map((entry) => (
                    <div key={entry.id} className="flex items-start justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-harbor-navy">{formatMoney(entry.amount)}</p>
                        <p className="text-xs text-harbor-navy/45">
                          {entry.date} - {entry.paymentMethod === "checking" ? "Checking / Anchor" : cardLookup[entry.paymentMethod] ?? entry.paymentMethod}
                          {entry.note ? ` - ${entry.note}` : ""}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void deleteSpendLog(entry)}
                        className="rounded-lg border border-harbor-red/20 px-2.5 py-1 text-xs font-medium text-harbor-red hover:bg-harbor-red/5"
                      >
                        Delete
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {pendingConfirmation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-harbor-navy/45 px-4 py-6">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="dock-confirmation-title"
            className="w-full max-w-md rounded-2xl border border-harbor-teal-light bg-white p-5 shadow-xl"
          >
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-harbor-teal">
                Harbor
              </p>
              <h2 id="dock-confirmation-title" className="text-xl font-bold text-harbor-navy">
                Close this month?
              </h2>
              <p className="text-sm leading-6 text-harbor-navy/65">
                Harbor will save this month&apos;s final checking cash and make the month read-only.
              </p>
            </div>

            <label className="mt-5 flex items-start gap-3 rounded-xl border border-slate-200 bg-harbor-offwhite p-3 text-sm text-harbor-navy/75">
              <input
                type="checkbox"
                checked={clearAfterConfirm}
                onChange={(e) => setClearAfterConfirm(e.target.checked)}
                className="mt-0.5 h-4 w-4 flex-shrink-0 accent-harbor-teal"
              />
              <span>
                Also clear entered values for this month
              </span>
            </label>

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeConfirmationDialog}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-harbor-navy/70 transition-colors hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmPendingAction()}
                className="rounded-lg bg-harbor-navy px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-harbor-navy/90"
              >
                Close Month
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
