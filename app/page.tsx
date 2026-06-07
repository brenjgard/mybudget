"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import type { KeyboardEvent, MouseEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { EmptyState } from "./components/EmptyState";
import { HelpTooltip } from "./components/HelpTooltip";
import { InfoCallout } from "./components/InfoCallout";
import { loadSettingsWithSupabaseFallback } from "./lib/budget-settings";
import { buildMonthForecast } from "./lib/forecast";
import { helpCopy } from "./lib/help-copy";
import type { CCCharge } from "./lib/local-repo";
import { budgetRepo } from "./lib/repositories/budget-repo";
import { getDockItemKind, getItemBehavior, isFlexibleRipple } from "./lib/ripple-type";
import { buildProjectedAmounts, getWeekRanges, lineItemAppliesToWeek, recurrenceDebugScenarios } from "./lib/schedule";
import type { AppSettings, DockItemState, DockItemStatus, ItemBehavior, PaymentMethod, SpendLogEntry } from "./lib/types";

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
  | { type: "wrap-week"; weekIndex: number }
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

type DockActionTarget = {
  item: AppSettings["lineItems"][number];
  weekIndex: number;
};

type DockActionDraft = {
  amount: string;
  pendingUntil: string;
  activeAction: DockItemStatus | null;
  note: string;
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

function weekdayLabel(value?: string) {
  if (!value) return "";
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return "";
  return new Date(year, month - 1, day).toLocaleDateString("en-US", { weekday: "short" });
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
  const [dockItemStates, setDockItemStates] = useState<DockItemState[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [autoFill, setAutoFill] = useState(false);
  const [monthAmountsLoading, setMonthAmountsLoading] = useState(true);
  const [monthBalances, setMonthBalances] = useState<Record<string, number>>({});
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);
  const [clearAfterConfirm, setClearAfterConfirm] = useState(false);
  const [spendLogTarget, setSpendLogTarget] = useState<SpendLogTarget | null>(null);
  const [spendLogDraft, setSpendLogDraft] = useState<SpendLogDraft>(BLANK_SPEND_LOG);
  const [isEditingBudget, setIsEditingBudget] = useState(false);
  const [dockActionTarget, setDockActionTarget] = useState<DockActionTarget | null>(null);
  const [dockActionDraft, setDockActionDraft] = useState<DockActionDraft>({ amount: "", pendingUntil: "", activeAction: null, note: "" });

  // ── Feature 1: Collapsible categories ────────────────────────────────────
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  // ── Feature 5: Wrap Week tracking ────────────────────────────────────────
  const [closedWeeks, setClosedWeeks] = useState<Set<string>>(new Set());
  const [closedMonths, setClosedMonths] = useState<Set<string>>(new Set());
  const [activeWeekIdx, setActiveWeekIdx] = useState(0);
  const anchorSaveSeq = useRef(0);
  const anchorDraftRef = useRef("");
  const anchorDirtyRef = useRef(false);
  const anchorSavePromiseRef = useRef<Promise<void>>(Promise.resolve());
  const wrappingWeekKeysRef = useRef<Set<string>>(new Set());
  const amountsMonthKeyRef = useRef("");
  const [amountsMonthKey, setAmountsMonthKey] = useState("");
  const amountEditVersionsRef = useRef<Record<string, number>>({});
  const monthlyAmountSnapshotsRef = useRef<Record<string, Record<string, Record<number, number>>>>({});
  const monthlyAmountSaveChainsRef = useRef<Record<string, Promise<void>>>({});
  const monthlyAmountSaveTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // cardLookup available before early return (used in closeWeek)
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

  async function saveMonthlyAmountsNow(key: string, nextAmounts: Record<string, Record<number, number>>) {
    monthlyAmountSnapshotsRef.current[key] = nextAmounts;
    const existingTimer = monthlyAmountSaveTimersRef.current[key];
    if (existingTimer) {
      clearTimeout(existingTimer);
      delete monthlyAmountSaveTimersRef.current[key];
    }
    await flushMonthlyAmountsSave(key, getAmountEditVersion(key));
  }

  // Load on mount
  useEffect(() => {
    let cancelled = false;

    async function loadInitialData() {
      const [s, savedAmounts, savedMonthBalances, savedAnchorOverride, savedClosedMonths, savedClosedWeeks, savedSpendLogs, savedDockItemStates] = await Promise.all([
        loadSettingsWithSupabaseFallback(),
        budgetRepo.getMonthlyAmounts(monthKey),
        budgetRepo.getMonthBalances(),
        budgetRepo.getAnchorOverride(),
        budgetRepo.getClosedMonths(),
        budgetRepo.getClosedWeeks(monthKey),
        budgetRepo.getSpendLogs(monthKey),
        budgetRepo.getDockItemStates(monthKey),
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
      setDockItemStates(savedDockItemStates);
      setMonthBalances(savedMonthBalances);
      setClosedMonths(savedClosedMonths);
      setClosedWeeks(savedClosedWeeks);
      setLoaded(true);
      setAutoFill(true);
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
      setMonthAmountsLoading(true);
    }

    void Promise.all([
      budgetRepo.getMonthlyAmounts(currentMonthKey),
      budgetRepo.getClosedWeeks(currentMonthKey),
      budgetRepo.getSpendLogs(currentMonthKey),
      budgetRepo.getDockItemStates(currentMonthKey),
    ]).then(([saved, savedClosedWeeks, savedSpendLogs, savedDockItemStates]) => {
      if (cancelled) return;

      setClosedWeeks(savedClosedWeeks);
      setSpendLogs(savedSpendLogs);
      setDockItemStates(savedDockItemStates);

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
  const dockStatesByItemWeek = useMemo(() => {
    const result: Record<string, DockItemState> = {};
    dockItemStates.forEach((state) => {
      result[`${state.itemId}-${state.itemKind}-${state.weekIndex}`] = state;
    });
    return result;
  }, [dockItemStates]);
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
        const state = dockStatesByItemWeek[`${item.id}-${getDockItemKind(item)}-${weekIndex}`];
        nextByWeek[weekIndex] = state?.status === "cleared" ? spent : Math.max(planned, spent);
      });

      return { ...nextAmounts, [item.id]: nextByWeek };
    }, visibleAmounts);
  }, [dockStatesByItemWeek, settings, spendLogsByRippleWeek, visibleAmounts, weeks]);

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
  const weekTotals = forecast?.weekTotals ?? [];
  const projectedBalances = forecast?.projectedBalances ?? [];
  const projectedForwardBalance = forecast?.projectedForwardBalance ?? startingBalance;
  const displayedForwardBalance = forecast?.displayedForwardBalance ?? projectedForwardBalance;
  const balanceLabel = forecast?.balanceLabel ?? (isMonthClosed ? "Final Balance" : "Projected Balance");
  const isProjectedBalanceLoading = !isMonthClosed && isMonthAmountsPending;

  function itemAppliesToVisibleMonth(item: AppSettings["lineItems"][number]) {
    return weeks.some((week, weekIndex) =>
      lineItemAppliesToWeek(item, weekIndex, week.start, week.end, month)
    );
  }

  function getSpendEntries(itemId: string, weekIndex: number) {
    return spendLogsByRippleWeek[`${itemId}-${weekIndex}`] ?? [];
  }

  function getSpentTotal(itemId: string, weekIndex: number) {
    return getSpendEntries(itemId, weekIndex).reduce((sum, entry) => sum + entry.amount, 0);
  }

  function getDockState(item: AppSettings["lineItems"][number], weekIndex: number) {
    const itemKind = getDockItemKind(item);
    return dockStatesByItemWeek[`${item.id}-${itemKind}-${weekIndex}`];
  }

  function getStatusLabel(status: DockItemStatus | undefined, behavior: ItemBehavior) {
    if (status === "pending") return "Pending";
    if (status === "skipped") return "Skipped";
    if (status === "adjusted") return "Adjusted";
    if (status === "cleared") {
      if (behavior === "income") return "Received";
      if (behavior === "credit_card_payment") return "Cleared";
      if (behavior === "flexible_spend") return "Done";
      return "Paid";
    }
    return "Upcoming";
  }

  function getCellStatusLabel(status: DockItemStatus | undefined, behavior: ItemBehavior, isWrapped: boolean) {
    if (isWrapped && (!status || status === "upcoming")) return "Wrapped";
    if (!status || status === "upcoming") return "";
    return getStatusLabel(status, behavior);
  }

  function statusBadgeTone(status: DockItemStatus | "wrapped" | undefined, remaining?: number) {
    if (status === "wrapped") return "bg-harbor-green/10 text-harbor-green";
    if (status === "pending") return "bg-amber-100 text-amber-800";
    if (status === "cleared") return "bg-harbor-green/10 text-harbor-green";
    if (status === "skipped") return "bg-slate-100 text-slate-500";
    if (status === "adjusted") return "bg-harbor-teal/10 text-harbor-teal";
    if (remaining !== undefined && remaining < 0) return "bg-harbor-red/10 text-harbor-red";
    return "bg-slate-100 text-slate-500";
  }

  function endAmountEdit() {
    return;
  }

  function handleAmountEditKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === "Escape") {
      event.currentTarget.blur();
      endAmountEdit();
    }
  }

  const creditTotals = useMemo(() => {
    if (!settings) return [];
    return weeks.map((_, wi) => {
      const byCard: Record<string, number> = {};
      for (const item of settings.lineItems) {
        if (item.isIncome || item.paymentMethod === "checking") continue;
        if (!lineItemAppliesToWeek(item, wi, weeks[wi].start, weeks[wi].end, month)) continue;
        const n = forecastAmounts[item.id]?.[wi] ?? 0;
        byCard[item.paymentMethod] = (byCard[item.paymentMethod] ?? 0) + n;
      }
      return byCard;
    });
  }, [forecastAmounts, weeks, settings, month]);

  // Category totals per week — used by collapsed rows
  const categoryWeekTotals = useMemo(() => {
    if (!settings) return {} as Record<string, number[]>;
    const result: Record<string, number[]> = {};
    for (const cat of settings.categories) {
      const catItems = settings.lineItems.filter((i) => i.category === cat);
      result[cat] = weeks.map((_, wi) => {
        let total = 0;
        for (const item of catItems) {
          if (!lineItemAppliesToWeek(item, wi, weeks[wi].start, weeks[wi].end, month)) continue;
          total += forecastAmounts[item.id]?.[wi] ?? 0;
        }
        return total;
      });
    }
    return result;
  }, [forecastAmounts, weeks, settings, month]);

  // Save ending balance for this month whenever projectedBalances changes
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

  function getAmount(itemId: string, weekIdx: number): number | "" {
    if (isMonthAmountsPending) return "";
    return amounts[itemId]?.[weekIdx] ?? "";
  }

  function setAmount(itemId: string, weekIdx: number, val: number | "") {
    if (isWeekReadOnly(weekIdx)) return;
    bumpAmountEditVersion(monthKey);
    const wasEditingVisibleMonth = amountsMonthKeyRef.current === monthKey;
    amountsMonthKeyRef.current = monthKey;
    setAmountsMonthKey(monthKey);
    setAmounts((prev) => {
      const base = wasEditingVisibleMonth ? prev : {};
      const next = {
        ...base,
        [itemId]: { ...(base[itemId] ?? {}), [weekIdx]: val === "" ? 0 : val },
      };
      monthlyAmountSnapshotsRef.current[monthKey] = next;
      return next;
    });
  }

  function openSpendLog(item: AppSettings["lineItems"][number], weekIndex: number) {
    if (!isFlexibleRipple(item) || isWeekReadOnly(weekIndex)) return;
    setSpendLogTarget({ source: "detail" });
    setSpendLogDraft({
      ...BLANK_SPEND_LOG,
      rippleId: item.id,
      weekIndex,
      paymentMethod: item.paymentMethod,
      date: todayISODate(),
    });
  }

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

  function openDockActions(item: AppSettings["lineItems"][number], weekIndex: number) {
    if (isWeekReadOnly(weekIndex)) return;
    const planned = Number(getAmount(item.id, weekIndex) || 0);
    const existing = getDockState(item, weekIndex);
    setDockActionTarget({ item, weekIndex });
    setDockActionDraft({
      amount: String(existing?.actualAmount ?? planned),
      pendingUntil: existing?.pendingUntil ?? "",
      activeAction: null,
      note: existing?.note ?? "",
    });
  }

  function closeDockActions() {
    setDockActionTarget(null);
    setDockActionDraft({ amount: "", pendingUntil: "", activeAction: null, note: "" });
  }

  function openSpendLogFromDockActions() {
    if (!dockActionTarget) return;
    const { item, weekIndex } = dockActionTarget;
    closeDockActions();
    openSpendLog(item, weekIndex);
  }

  async function saveDockStatus(status: DockItemStatus) {
    if (!dockActionTarget) return;
    const { item, weekIndex } = dockActionTarget;
    const behaviorType = getItemBehavior(item);
    const needsActionInput = status === "adjusted" || status === "pending" || (status === "cleared" && behaviorType !== "flexible_spend");
    if (needsActionInput && dockActionDraft.activeAction !== status) {
      setDockActionDraft((draft) => ({
        ...draft,
        activeAction: status,
        pendingUntil: status === "pending" ? draft.pendingUntil || todayISODate() : draft.pendingUntil,
      }));
      return;
    }

    const itemKind = getDockItemKind(item);
    const plannedAmount = Number(getAmount(item.id, weekIndex) || 0);
    const amount = Number(dockActionDraft.amount);
    const actualAmount = behaviorType === "flexible_spend" && status === "cleared"
      ? getSpentTotal(item.id, weekIndex)
      : Number.isFinite(amount) && amount >= 0 ? amount : plannedAmount;
    const now = new Date().toISOString();

    // TODO: Pending state should feed a future Safe Anchor display without changing the current Anchor.
    const savedState = await budgetRepo.saveDockItemState({
      ...getDockState(item, weekIndex),
      monthKey,
      weekIndex,
      itemId: item.id,
      itemKind,
      behaviorType,
      status,
      statusUpdatedAt: now,
      plannedAmount,
      actualAmount,
      pendingUntil: status === "pending" ? dockActionDraft.pendingUntil || undefined : undefined,
      clearedAt: status === "cleared" ? now : undefined,
      note: dockActionDraft.note.trim() || undefined,
    });

    setDockItemStates((current) => {
      const without = current.filter((state) => !(
        state.itemId === item.id
        && state.itemKind === itemKind
        && state.weekIndex === weekIndex
      ));
      return [...without, savedState];
    });

    if (status === "adjusted" && actualAmount !== plannedAmount) {
      setAmount(item.id, weekIndex, actualAmount);
      await saveMonthlyAmountsNow(monthKey, {
        ...amounts,
        [item.id]: { ...(amounts[item.id] ?? {}), [weekIndex]: actualAmount },
      });
    }

    closeDockActions();
  }

  async function clearDockStatus() {
    if (!dockActionTarget) return;
    const { item, weekIndex } = dockActionTarget;
    const itemKind = getDockItemKind(item);
    await budgetRepo.deleteDockItemState(monthKey, item.id, itemKind, weekIndex);
    setDockItemStates((current) => current.filter((state) => !(
      state.itemId === item.id
      && state.itemKind === itemKind
      && state.weekIndex === weekIndex
    )));
    closeDockActions();
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
    await moveLoggedCardSpendToNextPayment(savedEntry, 1);
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
    setSpendLogs((current) => current.filter((item) => item.id !== entry.id));
    await moveLoggedCardSpendToNextPayment(entry, -1);
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

  function toggleCategory(cat: string) {
    setCollapsed((prev) => ({ ...prev, [cat]: !prev[cat] }));
  }

  // ── Feature 5: Wrap Week CC flow ──────────────────────────────────────────
  function isWeekWrapped(wi: number) {
    return forecast?.isWeekWrapped(wi) ?? false;
  }

  function isWeekReadOnly(weekIdx: number) {
    return isMonthClosed || isMonthAmountsPending || isWeekWrapped(weekIdx);
  }

  function clearWeekValues(sourceAmounts: Record<string, Record<number, number>>, wi: number) {
    return Object.fromEntries(
      Object.entries(sourceAmounts).map(([itemId, byWeek]) => [
        itemId,
        { ...byWeek, [wi]: 0 },
      ]),
    ) as Record<string, Record<number, number>>;
  }

  function findCardPaymentLine(cardLabel: string) {
    if (!settings) return undefined;
    const normalizedCardLabel = cardLabel.trim().toLowerCase();
    const exactPaymentName = `${normalizedCardLabel} payment`;
    const candidates = settings.lineItems.filter(
      (item) =>
        item.category === "Credit Cards" &&
        item.paymentMethod === "checking" &&
        !item.isIncome,
    );

    return (
      candidates.find((item) => item.name.trim().toLowerCase() === exactPaymentName) ??
      candidates.find((item) => {
        const normalizedName = item.name.trim().toLowerCase();
        return normalizedName.includes(normalizedCardLabel) && normalizedName.includes("payment");
      })
    );
  }

  function nextMonthKeyFrom(sourceMonthKey: string) {
    const [sourceYear, sourceMonth] = sourceMonthKey.split("-").map(Number);
    if (!sourceYear || !sourceMonth) return monthKey;
    return sourceMonth === 12
      ? `${sourceYear + 1}-01`
      : `${sourceYear}-${String(sourceMonth + 1).padStart(2, "0")}`;
  }

  function monthKeyFromDateParts(yearValue: number, monthIndex: number) {
    return `${yearValue}-${String(monthIndex + 1).padStart(2, "0")}`;
  }

  function lastDayOfMonth(yearValue: number, monthIndex: number) {
    return new Date(yearValue, monthIndex + 1, 0).getDate();
  }

  function clampedStatementCloseDate(yearValue: number, monthIndex: number, closingDay: number) {
    return new Date(yearValue, monthIndex, Math.min(closingDay, lastDayOfMonth(yearValue, monthIndex)));
  }

  function statementMonthForSpendDate(spendDate: string, statementClosingDay?: number) {
    const [spendYear, spendMonth, spendDay] = spendDate.slice(0, 10).split("-").map(Number);
    if (!spendYear || !spendMonth || !spendDay) return monthKey;

    const closingDay = Math.min(31, Math.max(1, statementClosingDay ?? 31));
    const spend = new Date(spendYear, spendMonth - 1, spendDay);
    const thisMonthClose = clampedStatementCloseDate(spendYear, spendMonth - 1, closingDay);

    if (spend <= thisMonthClose) {
      return monthKeyFromDateParts(spendYear, spendMonth - 1);
    }

    const nextMonth = spendMonth === 12 ? 0 : spendMonth;
    const nextYear = spendMonth === 12 ? spendYear + 1 : spendYear;
    return monthKeyFromDateParts(nextYear, nextMonth);
  }

  function cardPaymentWeekIndex(paymentItem: AppSettings["lineItems"][number], targetMonthKey: string) {
    const [targetYear, targetMonth] = targetMonthKey.split("-").map(Number);
    if (!targetYear || !targetMonth) return 2;

    const targetWeeks = getWeekRanges(targetYear, targetMonth - 1);
    const matchingWeekIndex = targetWeeks.findIndex((week, weekIndex) => (
      lineItemAppliesToWeek(paymentItem, weekIndex, week.start, week.end, targetMonth - 1)
    ));

    return matchingWeekIndex >= 0 ? matchingWeekIndex : 2;
  }

  async function moveLoggedCardSpendToNextPayment(entry: SpendLogEntry, direction: 1 | -1) {
    if (!settings || entry.paymentMethod === "checking") return;

    const card = settings.creditCards.find((candidate) => candidate.id === entry.paymentMethod);
    if (!card) return;

    const paymentItem = findCardPaymentLine(card.label);
    if (!paymentItem) return;

    const targetMonthKey = statementMonthForSpendDate(entry.date, card.statementClosingDay);
    const targetWeekIndex = cardPaymentWeekIndex(paymentItem, targetMonthKey);
    const targetAmounts = await budgetRepo.getMonthlyAmounts(targetMonthKey);
    const current = Number(targetAmounts[paymentItem.id]?.[targetWeekIndex] ?? 0);
    const next = Math.max(0, current + direction * entry.amount);
    const nextAmounts = {
      ...targetAmounts,
      [paymentItem.id]: { ...(targetAmounts[paymentItem.id] ?? {}), [targetWeekIndex]: next },
    };

    await budgetRepo.saveMonthlyAmounts(targetMonthKey, nextAmounts);
  }

  function loggedSpendForCard(itemId: string, weekIndex: number, cardId: PaymentMethod) {
    return getSpendEntries(itemId, weekIndex)
      .filter((entry) => entry.paymentMethod === cardId)
      .reduce((sum, entry) => sum + entry.amount, 0);
  }

  function forecastAmountForWrap(item: AppSettings["lineItems"][number], weekIndex: number) {
    const planned = amounts[item.id]?.[weekIndex] ?? 0;
    if (getItemBehavior(item) !== "flexible_spend") return planned;

    const spent = getSpentTotal(item.id, weekIndex);
    const state = getDockState(item, weekIndex);
    return state?.status === "cleared" ? spent : Math.max(planned, spent);
  }

  function statementMonthForWeek(card: AppSettings["creditCards"][number], weekIndex: number) {
    const weekEnd = weeks[weekIndex]?.end;
    if (!weekEnd) return nextMonthKeyFrom(monthKey);

    return statementMonthForSpendDate(
      [
        weekEnd.getFullYear(),
        String(weekEnd.getMonth() + 1).padStart(2, "0"),
        String(weekEnd.getDate()).padStart(2, "0"),
      ].join("-"),
      card.statementClosingDay,
    );
  }

  function openWrapWeekDialog(wi: number) {
    if (isMonthClosed || isMonthAmountsPending || isWeekWrapped(wi)) return;
    setClearAfterConfirm(false);
    setPendingConfirmation({ type: "wrap-week", weekIndex: wi });
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

    if (pending.type === "wrap-week") {
      await wrapWeek(pending.weekIndex, shouldClear);
    } else {
      await closeMonth(shouldClear);
    }
  }

  async function wrapWeek(wi: number, clearValues: boolean) {
    const wrapKey = `${monthKey}-checking-${wi}`;
    if (!settings || isMonthClosed || isMonthAmountsPending || isWeekWrapped(wi) || wrappingWeekKeysRef.current.has(wrapKey)) return;
    wrappingWeekKeysRef.current.add(wrapKey);

    try {
      const targetAmountsByMonth: Record<string, Record<string, Record<number, number>>> = {};
      const newCharges: CCCharge[] = [];

      for (const card of settings.creditCards) {
        const chargeItems = settings.lineItems.filter(
          (item) =>
            !item.isIncome &&
            item.paymentMethod === card.id &&
            lineItemAppliesToWeek(item, wi, weeks[wi].start, weeks[wi].end, month)
        );
        const total = chargeItems.reduce((sum, item) => {
          const alreadyMovedLoggedSpend = loggedSpendForCard(item.id, wi, card.id);
          return sum + Math.max(0, forecastAmountForWrap(item, wi) - alreadyMovedLoggedSpend);
        }, 0);

        newCharges.push(...chargeItems
          .flatMap((item) => {
            const amount = Math.max(0, forecastAmountForWrap(item, wi) - loggedSpendForCard(item.id, wi, card.id));
            if (amount <= 0) return [];

            return {
              itemId: item.id,
              itemName: item.name,
              card: card.id,
              cardLabel: card.label,
              amount,
              weekLabel: weeks[wi].label,
              dateMoved: new Date().toISOString(),
            };
          }));

        if (total > 0) {
          const paymentItem = findCardPaymentLine(card.label);
          if (paymentItem) {
            const targetMonthKey = statementMonthForWeek(card, wi);
            const targetWeekIndex = cardPaymentWeekIndex(paymentItem, targetMonthKey);
            const targetAmounts = targetAmountsByMonth[targetMonthKey] ?? await budgetRepo.getMonthlyAmounts(targetMonthKey);
            const existing: number = Number(targetAmounts[paymentItem.id]?.[targetWeekIndex] ?? 0);
            targetAmountsByMonth[targetMonthKey] = {
              ...targetAmounts,
              [paymentItem.id]: { ...targetAmounts[paymentItem.id], [targetWeekIndex]: existing + total },
            };
          }
        }
      }

      await Promise.all(
        Object.entries(targetAmountsByMonth).map(([targetMonthKey, targetAmounts]) =>
          budgetRepo.saveMonthlyAmounts(targetMonthKey, targetAmounts)
        )
      );

      const savedClosedWeeks = await budgetRepo.closeWeek({
        monthKey,
        cardId: "checking",
        weekIndex: wi,
        charges: newCharges,
      });
      setClosedWeeks(savedClosedWeeks);

      if (clearValues) {
        const nextCurrentAmounts = clearWeekValues(amounts, wi);
        bumpAmountEditVersion(monthKey);
        setMonthAmountsState(monthKey, nextCurrentAmounts);
        await saveMonthlyAmountsNow(monthKey, nextCurrentAmounts);
      }
    } finally {
      wrappingWeekKeysRef.current.delete(wrapKey);
    }
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
              <button
                type="button"
                onClick={() => {
                  setIsEditingBudget((current) => !current);
                }}
                disabled={isMonthClosed}
                className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-300 ${
                  isEditingBudget
                    ? "border-harbor-teal bg-harbor-teal text-white hover:bg-harbor-teal/90"
                    : "border-harbor-teal/30 bg-white text-harbor-navy hover:bg-harbor-teal-light"
                }`}
              >
                {isEditingBudget ? "Done Editing" : "Edit Budget"}
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

        <div className="hidden md:block bg-white rounded-2xl shadow-sm overflow-x-auto border border-harbor-teal-light">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-harbor-navy text-white">
                <th className="text-left px-3 py-3 w-28 sticky left-0 bg-harbor-navy">Category</th>
                <th className="text-left px-3 py-3 w-44 sticky left-28 bg-harbor-navy">Item</th>
                <th className="text-center px-2 py-3 w-28">Method</th>
                {weeks.map((w, i) => (
                  <th key={i} className="text-center px-2 py-3 min-w-[130px]">
                    <div className="text-xs font-normal opacity-60">Week {i + 1}</div>
                    <div className="text-xs font-medium">{w.label}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {settings.categories.map((cat) => {
                const items = settings.lineItems.filter((i) => (
                  i.category === cat && itemAppliesToVisibleMonth(i)
                ));
                if (items.length === 0) return null;

                const isCollapsed = collapsed[cat] ?? false;
                const catTotals = categoryWeekTotals[cat] ?? [];

                // ── Collapsed: single summary row ──────────────────────────
                if (isCollapsed) {
                  return (
                    <tr
                      key={`${cat}-collapsed`}
                      onClick={() => toggleCategory(cat)}
                      className="border-t-2 border-harbor-teal/20 border-b border-slate-100 cursor-pointer hover:bg-harbor-offwhite"
                    >
                      <td className="px-3 py-3 bg-harbor-teal-light sticky left-0 border-r border-harbor-teal/20">
                        <div className="flex items-center gap-1.5">
                          <span className="text-harbor-teal text-xs">▶</span>
                          <span className="font-semibold text-harbor-navy text-xs uppercase tracking-wide">{cat}</span>
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5 pl-4">
                          {items.length} item{items.length !== 1 ? "s" : ""}
                        </div>
                      </td>
                      <td className="px-3 py-3 sticky left-28 bg-harbor-teal-light border-r border-slate-100 text-xs text-slate-400 italic">
                        {items.length} item{items.length !== 1 ? "s" : ""}
                      </td>
                      <td className="px-2 py-3" />
                      {catTotals.map((total, wi) => (
                        <td key={wi} className="px-2 py-3 text-center">
                          {total > 0 ? (
                            <span className="text-sm font-semibold text-slate-600">{formatMoney(total)}</span>
                          ) : (
                            <span className="text-slate-200 text-xs">—</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  );
                }

                // ── Expanded: all line item rows ────────────────────────────
                return items.map((item, idx) => (
                  <tr
                    key={item.id}
                    className={`border-b border-slate-100 hover:bg-harbor-offwhite ${idx === 0 ? "border-t-2 border-harbor-teal/20" : ""}`}
                  >
                    {idx === 0 && (
                      <td
                        rowSpan={items.length}
                        onClick={() => toggleCategory(cat)}
                        className="px-3 py-2 font-semibold text-harbor-navy bg-harbor-teal-light sticky left-0 border-r border-harbor-teal/20 text-xs uppercase tracking-wide align-top pt-3 cursor-pointer select-none"
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="text-harbor-teal">▼</span>
                          <span>{cat}</span>
                        </div>
                      </td>
                    )}
                    <td className="px-3 py-2 sticky left-28 bg-white border-r border-slate-100">
                      <div className="flex items-center gap-1.5 group">
                        <span>{item.name}</span>
                        {item.isIncome && <span className="text-xs text-harbor-green font-medium">↑</span>}
                        <Link
                          href="/settings"
                          aria-disabled={isMonthClosed}
                          onClick={(e) => {
                            if (isMonthClosed) {
                              e.preventDefault();
                              return;
                            }
                            void navigateAfterAnchorCommit(e, "/settings");
                          }}
                          className={`flex-shrink-0 transition-opacity ${
                            isMonthClosed
                              ? "pointer-events-none opacity-0 text-slate-200"
                              : "opacity-0 group-hover:opacity-100 text-slate-300 hover:text-harbor-teal"
                          }`}
                          title="Edit in Settings"
                        >
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                          </svg>
                        </Link>
                      </div>
                    </td>
                    <td className="px-2 py-2 text-center">
                      <Link
                        href="/settings"
                        aria-disabled={isMonthClosed}
                        onClick={(e) => {
                          if (isMonthClosed) {
                            e.preventDefault();
                            return;
                          }
                          void navigateAfterAnchorCommit(e, "/settings");
                        }}
                        title="Change method in Settings"
                        className={`inline-flex max-w-[6.5rem] items-center justify-center truncate whitespace-nowrap text-xs px-2 py-0.5 rounded-full font-medium hover:ring-2 hover:ring-offset-1 transition-all ${
                          isMonthClosed
                            ? "pointer-events-none bg-slate-100 text-slate-400"
                            : item.paymentMethod === "checking"
                            ? "bg-harbor-teal/15 text-harbor-teal hover:ring-harbor-teal/40"
                            : "bg-harbor-navy/10 text-harbor-navy hover:ring-harbor-navy/30"
                        }`}
                      >
                        {item.paymentMethod === "checking"
                          ? "CHK"
                          : cardLookup[item.paymentMethod] ?? item.paymentMethod}
                      </Link>
                    </td>
                    {weeks.map((_, wi) => {
                      const applies = lineItemAppliesToWeek(item, wi, weeks[wi].start, weeks[wi].end, month);
                      const val = getAmount(item.id, wi);
                      const isReadOnlyWeek = isWeekReadOnly(wi);
                      const planned = Number(val || 0);
                      const behavior = getItemBehavior(item);
                      const isFlexible = behavior === "flexible_spend";
                      const spent = isFlexible ? getSpentTotal(item.id, wi) : 0;
                      const remaining = planned - spent;
                      const dockState = getDockState(item, wi);
                      const status = dockState?.status ?? "upcoming";
                      const displayAmount = dockState?.actualAmount ?? planned;
                      const isWrappedWeek = isWeekWrapped(wi);
                      const statusLabel = getCellStatusLabel(status, behavior, isWrappedWeek);
                      const statusTone = isWrappedWeek && status === "upcoming" ? "wrapped" : status;
                      const pendingText = status === "pending" && dockState?.pendingUntil
                        ? `Pending - clears ${weekdayLabel(dockState.pendingUntil)}`
                        : statusLabel;
                      return (
                        <td key={wi} className="px-2 py-2 text-center align-top">
                          {applies ? (
                            <div className={`flex min-h-[4rem] flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 ${status === "pending" ? "bg-amber-50/80" : ""}`}>
                              {isEditingBudget ? (
                                <>
                                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-harbor-navy/35">
                                    {isFlexible ? "Budget" : "Planned"}
                                  </span>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              disabled={isReadOnlyWeek}
                              placeholder="—"
                              value={val === 0 ? "" : val}
                              onChange={(e) => setAmount(item.id, wi, e.target.value === "" ? "" : Number(e.target.value))}
                              onBlur={endAmountEdit}
                              onKeyDown={handleAmountEditKey}
                              className={item.isIncome
                                ? "w-24 text-right rounded-lg border-l-2 border-l-harbor-green border-t border-r border-b border-slate-200 px-2 py-1 text-sm text-harbor-green focus:outline-none focus:ring-1 focus:ring-harbor-teal/20 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
                                : "w-24 text-right rounded-lg border-l-2 border-l-harbor-red border-t border-r border-b border-slate-200 px-2 py-1 text-sm text-harbor-red focus:outline-none focus:ring-1 focus:ring-harbor-red/20 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"}
                            />
                                </>
                              ) : isFlexible ? (
                              <div className="w-full space-y-1 text-[11px] leading-tight text-slate-500">
                                <button
                                  type="button"
                                  onClick={() => openDockActions(item, wi)}
                                  disabled={isReadOnlyWeek}
                                  title="Open details"
                                  className={`block w-full text-center text-sm font-bold leading-tight disabled:cursor-default ${remaining < 0 ? "text-harbor-red" : "text-harbor-green"}`}
                                >
                                  {formatMoney(remaining)} left
                                </button>
                                {spent > 0 && (
                                  <div className="text-[11px] leading-tight text-slate-500">
                                    {formatMoney(spent)} spent
                                  </div>
                                )}
                                {pendingText && (
                                  <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusBadgeTone(statusTone, remaining)}`}>
                                    {pendingText}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <div className="space-y-1">
                                <button
                                  type="button"
                                  onClick={() => openDockActions(item, wi)}
                                  disabled={isReadOnlyWeek}
                                  title="Open details"
                                  className={`block rounded-lg px-2 py-0.5 text-sm font-semibold transition-colors disabled:cursor-default ${
                                    item.isIncome
                                      ? "text-harbor-green hover:bg-harbor-green/5"
                                      : "text-harbor-navy hover:bg-harbor-navy/5"
                                  }`}
                                >
                                  {formatMoney(displayAmount)}
                                </button>
                                {pendingText && (
                                  <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusBadgeTone(statusTone)}`}>
                                    {pendingText}
                                  </span>
                                )}
                              </div>
                            )}
                            </div>
                          ) : (
                            <span className="text-slate-200 text-xs">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ));
              })}

              {/* Summary section header */}
              <tr className="bg-harbor-teal-light/50">
                <td colSpan={3 + weeks.length} className="px-3 py-1 text-xs text-harbor-navy/50 uppercase tracking-wide font-semibold">
                  Dock Summary
                </td>
              </tr>

              {/* Credit card totals with Wrap Week */}
              {settings.creditCards.map((card) => (
                <tr key={card.id} className="bg-harbor-navy/5 font-semibold">
                  <td className="px-3 py-2 sticky left-0 bg-harbor-navy/5 text-xs uppercase tracking-wide text-harbor-navy" colSpan={2}>
                    {card.label}
                  </td>
                  <td />
                  {creditTotals.map((byCard, wi) => {
                    const total = byCard[card.id] ?? 0;
                    return (
                      <td key={wi} className="px-2 py-2 text-center text-harbor-navy">
                        {total > 0 ? (
                          <span>{formatMoney(total)}</span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}

              {/* Week wrap status */}
              <tr className="bg-harbor-navy/5 font-semibold">
                <td className="px-3 py-2 sticky left-0 bg-harbor-navy/5 text-xs uppercase tracking-wide text-harbor-navy" colSpan={2}>
                  <span className="inline-flex items-center gap-2">
                    Week Status
                    <HelpTooltip title={helpCopy.wrapWeek.title}>{helpCopy.wrapWeek.body}</HelpTooltip>
                  </span>
                </td>
                <td />
                {weeks.map((_, wi) => (
                  <td key={wi} className="px-2 py-2 text-center">
                    {isWeekWrapped(wi) ? (
                      <span className="text-xs text-harbor-green font-medium">✓ Wrapped</span>
                    ) : (
                      <button
                        onClick={() => openWrapWeekDialog(wi)}
                        disabled={isMonthClosed}
                        className="text-xs bg-harbor-navy text-white hover:bg-harbor-teal px-2.5 py-1 rounded-full font-medium transition-colors leading-none whitespace-nowrap disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:hover:bg-slate-200"
                      >
                        Wrap Week
                      </button>
                    )}
                  </td>
                ))}
              </tr>

              {/* Week net */}
              <tr className="bg-harbor-teal-light font-semibold">
                <td className="px-3 py-2 sticky left-0 bg-harbor-teal-light text-xs uppercase tracking-wide text-harbor-navy" colSpan={2}>
                  Net
                </td>
                <td />
                {weekTotals.map((t, i) => (
                  <td key={i} className={`px-2 py-2 text-center font-bold ${t >= 0 ? "text-harbor-green" : "text-harbor-red"}`}>
                    {formatMoney(t)}
                  </td>
                ))}
              </tr>

              {/* Projected/final balance */}
              <tr className="bg-harbor-navy text-white font-bold">
                <td className="px-3 py-3 sticky left-0 bg-harbor-navy text-xs uppercase tracking-wide" colSpan={2}>
                  {balanceLabel}
                </td>
                <td />
                {projectedBalances.map((b, i) => (
                  <td key={i} className={`px-2 py-3 text-center text-base ${b >= 0 ? "text-harbor-green" : "text-harbor-red"}`}>
                    {isMonthClosed
                      ? i === projectedBalances.length - 1 ? formatMoney(displayedForwardBalance) : "—"
                      : formatMoney(b)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>

        {/* Mobile card view — visible only below md */}
        {weeks.length > 0 && (
          <div className="block md:hidden space-y-3">

            {/* Category cards */}
            {settings.categories.map((cat) => {
              const items = settings.lineItems.filter((i) => i.category === cat);
              const applicableItems = items.filter((item) =>
                lineItemAppliesToWeek(
                  item,
                  activeWeekIdx,
                  weeks[activeWeekIdx].start,
                  weeks[activeWeekIdx].end,
                  month
                )
              );
              if (applicableItems.length === 0) return null;
              return (
                <div key={cat} className="bg-white rounded-2xl shadow-sm border border-harbor-teal-light overflow-hidden">
                  <div className="bg-harbor-teal-light px-4 py-2">
                    <span className="font-semibold text-harbor-navy text-xs uppercase tracking-wide">{cat}</span>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {applicableItems.map((item) => {
                      const val = getAmount(item.id, activeWeekIdx);
                      const isReadOnlyWeek = isWeekReadOnly(activeWeekIdx);
                      const planned = Number(val || 0);
                      const behavior = getItemBehavior(item);
                      const isFlexible = behavior === "flexible_spend";
                      const spent = isFlexible ? getSpentTotal(item.id, activeWeekIdx) : 0;
                      const remaining = planned - spent;
                      const dockState = getDockState(item, activeWeekIdx);
                      const status = dockState?.status ?? "upcoming";
                      const displayAmount = dockState?.actualAmount ?? planned;
                      const isWrappedWeek = isWeekWrapped(activeWeekIdx);
                      const statusLabel = getCellStatusLabel(status, behavior, isWrappedWeek);
                      const statusTone = isWrappedWeek && status === "upcoming" ? "wrapped" : status;
                      const pendingText = status === "pending" && dockState?.pendingUntil
                        ? `Pending - clears ${weekdayLabel(dockState.pendingUntil)}`
                        : statusLabel;
                      return (
                        <div
                          key={item.id}
                          role={isEditingBudget || isReadOnlyWeek ? undefined : "button"}
                          tabIndex={isEditingBudget || isReadOnlyWeek ? undefined : 0}
                          onClick={() => {
                            if (!isEditingBudget && !isReadOnlyWeek) openDockActions(item, activeWeekIdx);
                          }}
                          onKeyDown={(event) => {
                            if (isEditingBudget || isReadOnlyWeek) return;
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              openDockActions(item, activeWeekIdx);
                            }
                          }}
                          className={`flex items-start justify-between px-4 py-3 gap-3 ${status === "pending" ? "bg-amber-50/80" : ""} ${isEditingBudget || isReadOnlyWeek ? "" : "cursor-pointer hover:bg-harbor-offwhite"}`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm text-slate-700 truncate">{item.name}</span>
                            {item.isIncome && <span className="text-xs text-harbor-green font-medium flex-shrink-0">↑</span>}
                            </div>
                            {isFlexible && spent > 0 && (
                              <div className="mt-1 text-xs leading-5 text-slate-500">
                                <span>{formatMoney(spent)} spent</span>
                              </div>
                            )}
                            {isFlexible && pendingText && (
                              <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusBadgeTone(statusTone, remaining)}`}>
                                {pendingText}
                              </span>
                            )}
                            {!isFlexible && pendingText && (
                              <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusBadgeTone(statusTone)}`}>
                                {pendingText}
                              </span>
                            )}
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            {isEditingBudget ? (
                              <div className="flex flex-col items-end gap-1">
                                <span className="text-[10px] font-semibold uppercase tracking-wide text-harbor-navy/35">
                                  {isFlexible ? "Budget" : "Planned"}
                                </span>
                              <input
                                type="number"
                                inputMode="decimal"
                                min="0"
                                step="0.01"
                                disabled={isReadOnlyWeek}
                                placeholder="0"
                                value={val === 0 ? "" : val}
                                onChange={(e) => setAmount(item.id, activeWeekIdx, e.target.value === "" ? "" : Number(e.target.value))}
                                onBlur={endAmountEdit}
                                onKeyDown={handleAmountEditKey}
                                className={`w-24 text-right rounded-lg border-l-2 px-2 py-2 text-sm flex-shrink-0 focus:outline-none focus:ring-1 ${
                                  item.isIncome
                                    ? "border-l-harbor-green border border-slate-200 text-harbor-green focus:ring-harbor-teal/20 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
                                    : "border-l-harbor-red border border-slate-200 text-harbor-red focus:ring-harbor-red/20 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
                                }`}
                              />
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => openDockActions(item, activeWeekIdx)}
                                disabled={isReadOnlyWeek}
                                title="Open details"
                                className={`rounded-lg px-2 py-1 text-right text-sm font-semibold disabled:cursor-default ${
                                  isFlexible
                                    ? remaining < 0 ? "text-harbor-red" : "text-harbor-green"
                                    : item.isIncome ? "text-harbor-green" : "text-harbor-red"
                                }`}
                              >
                                {isFlexible ? `${formatMoney(remaining)} left` : formatMoney(displayAmount)}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* Summary card */}
            <div className="bg-white rounded-2xl shadow-sm border border-harbor-teal-light overflow-hidden">
              <div className="bg-harbor-teal-light px-4 py-2">
                <span className="font-semibold text-harbor-navy text-xs uppercase tracking-wide">Dock Summary</span>
              </div>
              <div className="divide-y divide-slate-100">
                {settings.creditCards.map((card) => {
                  const total = creditTotals[activeWeekIdx]?.[card.id] ?? 0;
                  if (total === 0) return null;
                  return (
                    <div key={card.id} className="flex items-center justify-between px-4 py-3 gap-3">
                      <span className="text-sm font-semibold text-harbor-navy">{card.label}</span>
                      <span className="text-sm font-semibold text-harbor-navy">{formatMoney(total)}</span>
                    </div>
                  );
                })}
                <div className="flex items-center justify-between px-4 py-3 gap-3">
                  <span className="inline-flex items-center gap-2 text-sm font-semibold text-harbor-navy">
                    Week Status
                    <HelpTooltip title={helpCopy.wrapWeek.title}>{helpCopy.wrapWeek.body}</HelpTooltip>
                  </span>
                  {isWeekWrapped(activeWeekIdx) ? (
                    <span className="text-xs text-harbor-green font-medium">✓ Wrapped</span>
                  ) : (
                    <button
                      onClick={() => openWrapWeekDialog(activeWeekIdx)}
                      disabled={isMonthClosed}
                      className="text-xs bg-harbor-navy text-white hover:bg-harbor-teal px-2.5 py-1.5 rounded-full font-medium transition-colors whitespace-nowrap disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:hover:bg-slate-200"
                    >
                      Wrap Week
                    </button>
                  )}
                </div>
                <div className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-sm font-semibold text-harbor-navy uppercase tracking-wide">Net</span>
                  <span className={`text-sm font-bold ${(weekTotals[activeWeekIdx] ?? 0) >= 0 ? "text-harbor-green" : "text-harbor-red"}`}>
                    {formatMoney(weekTotals[activeWeekIdx] ?? 0)}
                  </span>
                </div>
                <div className="flex items-center justify-between px-4 py-3 bg-harbor-navy rounded-b-2xl">
                  <span className="text-sm font-bold text-white uppercase tracking-wide">{balanceLabel}</span>
                  <span className={`text-base font-bold ${(isMonthClosed ? displayedForwardBalance : projectedBalances[activeWeekIdx] ?? 0) >= 0 ? "text-harbor-green" : "text-harbor-red"}`}>
                    {formatMoney(isMonthClosed ? displayedForwardBalance : projectedBalances[activeWeekIdx] ?? 0)}
                  </span>
                </div>
              </div>
            </div>

          </div>
        )}
          </>
        )}

      </div>

      {dockActionTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-harbor-navy/45 px-4 py-6">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="dock-action-title"
            className="w-full max-w-md rounded-2xl border border-harbor-teal-light bg-white p-5 shadow-xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-harbor-teal">Update Dock</p>
                <h2 id="dock-action-title" className="mt-1 text-xl font-bold text-harbor-navy">{dockActionTarget.item.name}</h2>
                <p className="mt-1 text-sm text-harbor-navy/55">
                  Week {dockActionTarget.weekIndex + 1} - {weeks[dockActionTarget.weekIndex]?.label}
                </p>
              </div>
              <button
                type="button"
                onClick={closeDockActions}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-harbor-navy/60 hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <div className="mt-4 rounded-xl bg-harbor-offwhite px-4 py-3 text-sm text-harbor-navy/70">
              <div className="flex items-center justify-between gap-3">
                <span>Status</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusBadgeTone(
                  isWeekWrapped(dockActionTarget.weekIndex) && (getDockState(dockActionTarget.item, dockActionTarget.weekIndex)?.status ?? "upcoming") === "upcoming"
                    ? "wrapped"
                    : getDockState(dockActionTarget.item, dockActionTarget.weekIndex)?.status ?? "upcoming",
                )}`}>
                  {getCellStatusLabel(
                    getDockState(dockActionTarget.item, dockActionTarget.weekIndex)?.status ?? "upcoming",
                    getItemBehavior(dockActionTarget.item),
                    isWeekWrapped(dockActionTarget.weekIndex),
                  ) || "Upcoming"}
                </span>
              </div>
              {getDockState(dockActionTarget.item, dockActionTarget.weekIndex)?.pendingUntil && (
                <div className="mt-2 flex items-center justify-between gap-3">
                  <span>Clears</span>
                  <span>{weekdayLabel(getDockState(dockActionTarget.item, dockActionTarget.weekIndex)?.pendingUntil)}</span>
                </div>
              )}
            </div>

            {dockActionDraft.activeAction && (
              <div className="mt-5 grid gap-3 rounded-xl border border-harbor-teal-light bg-white px-4 py-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">
                    {dockActionDraft.activeAction === "adjusted" ? "New amount" : "Amount"}
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      value={dockActionDraft.amount}
                      onChange={(e) => setDockActionDraft((draft) => ({ ...draft, amount: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 py-2 pl-7 pr-3 text-sm text-harbor-navy focus:border-harbor-teal focus:outline-none"
                      autoFocus
                    />
                  </div>
                </div>
                {dockActionDraft.activeAction === "pending" && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">Pending until</label>
                    <input
                      type="date"
                      value={dockActionDraft.pendingUntil}
                      onChange={(e) => setDockActionDraft((draft) => ({ ...draft, pendingUntil: e.target.value }))}
                      className="w-full rounded-xl border border-amber-200 bg-amber-50/60 px-3 py-2 text-sm text-harbor-navy focus:border-amber-300 focus:outline-none"
                    />
                  </div>
                )}
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-slate-500">Note</label>
                  <input
                    type="text"
                    value={dockActionDraft.note}
                    onChange={(e) => setDockActionDraft((draft) => ({ ...draft, note: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-harbor-navy focus:border-harbor-teal focus:outline-none"
                    placeholder="Optional"
                  />
                </div>
              </div>
            )}

            <div className="mt-5 grid gap-2">
              {getItemBehavior(dockActionTarget.item) === "flexible_spend" ? (
                <>
                  <button
                    type="button"
                    onClick={openSpendLogFromDockActions}
                    className="rounded-lg border border-harbor-red/25 px-4 py-2 text-sm font-medium text-harbor-red hover:bg-harbor-red/5"
                  >
                    Log Spend
                  </button>
                  <button type="button" onClick={() => void saveDockStatus("adjusted")} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-harbor-navy hover:bg-slate-50">
                    {dockActionDraft.activeAction === "adjusted" ? "Save Budget" : "Adjust Budget"}
                  </button>
                  <button type="button" onClick={() => void saveDockStatus("cleared")} className="rounded-lg border border-harbor-green/25 px-4 py-2 text-sm font-medium text-harbor-green hover:bg-harbor-green/5">
                    Mark Done
                  </button>
                </>
              ) : getItemBehavior(dockActionTarget.item) === "income" ? (
                <>
                  <button type="button" onClick={() => void saveDockStatus("cleared")} className="rounded-lg border border-harbor-green/25 px-4 py-2 text-sm font-medium text-harbor-green hover:bg-harbor-green/5">
                    {dockActionDraft.activeAction === "cleared" ? "Save Received" : "Mark Received"}
                  </button>
                  <button type="button" onClick={() => void saveDockStatus("pending")} className="rounded-lg border border-amber-200 px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-50">
                    {dockActionDraft.activeAction === "pending" ? "Save Pending" : "Mark Pending"}
                  </button>
                  <button type="button" onClick={() => void saveDockStatus("adjusted")} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-harbor-navy hover:bg-slate-50">
                    {dockActionDraft.activeAction === "adjusted" ? "Save Amount" : "Adjust Amount"}
                  </button>
                </>
              ) : (
                <>
                  <button type="button" onClick={() => void saveDockStatus("cleared")} className="rounded-lg border border-harbor-green/25 px-4 py-2 text-sm font-medium text-harbor-green hover:bg-harbor-green/5">
                    {dockActionDraft.activeAction === "cleared"
                      ? getItemBehavior(dockActionTarget.item) === "credit_card_payment" ? "Save Cleared" : "Save Paid"
                      : getItemBehavior(dockActionTarget.item) === "credit_card_payment" ? "Mark Cleared" : "Mark Paid"}
                  </button>
                  <button type="button" onClick={() => void saveDockStatus("pending")} className="rounded-lg border border-amber-200 px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-50">
                    {dockActionDraft.activeAction === "pending" ? "Save Pending" : "Mark Pending"}
                  </button>
                  <button type="button" onClick={() => void saveDockStatus("adjusted")} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-harbor-navy hover:bg-slate-50">
                    {dockActionDraft.activeAction === "adjusted" ? "Save Amount" : "Adjust Amount"}
                  </button>
                  {getItemBehavior(dockActionTarget.item) !== "credit_card_payment" && (
                    <button type="button" onClick={() => void saveDockStatus("skipped")} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-500 hover:bg-slate-50">
                      Skip This Week
                    </button>
                  )}
                </>
              )}
              <button type="button" onClick={() => void clearDockStatus()} className="rounded-lg px-4 py-2 text-sm font-medium text-harbor-navy/50 hover:bg-slate-50">
                Clear Status
              </button>
            </div>
          </div>
        </div>
      )}

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
                {pendingConfirmation.type === "wrap-week" ? "Wrap this week?" : "Close this month?"}
              </h2>
              <p className="text-sm leading-6 text-harbor-navy/65">
                {pendingConfirmation.type === "wrap-week"
                  ? "Harbor will mark this week as handled. Credit card spending will be moved to the next month’s card payment."
                  : "Harbor will save this month’s final balance and make the month read-only."}
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
                {pendingConfirmation.type === "wrap-week"
                  ? "Also clear entered values for this week"
                  : "Also clear entered values for this month"}
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
                {pendingConfirmation.type === "wrap-week" ? "Wrap Week" : "Close Month"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
