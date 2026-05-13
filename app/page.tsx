"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import type { MouseEvent } from "react";
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
import { getWeekRanges, itemAppliesToWeek } from "./lib/schedule";
import { AppSettings } from "./lib/types";

function formatMoney(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

type PendingConfirmation =
  | { type: "wrap-week"; weekIndex: number }
  | { type: "close-month" };

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
  const [loaded, setLoaded] = useState(false);
  const [autoFill, setAutoFill] = useState(false);
  const [monthAmountsLoading, setMonthAmountsLoading] = useState(true);
  const [monthBalances, setMonthBalances] = useState<Record<string, number>>({});
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);
  const [clearAfterConfirm, setClearAfterConfirm] = useState(false);

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
      const [s, savedAmounts, savedMonthBalances, savedAnchorOverride, savedClosedMonths] = await Promise.all([
        loadSettingsWithSupabaseFallback(),
        budgetRepo.getMonthlyAmounts(monthKey),
        budgetRepo.getMonthBalances(),
        budgetRepo.getAnchorOverride(),
        budgetRepo.getClosedMonths(),
      ]);
      if (cancelled) return;
      if (!s) { router.push("/setup"); return; }
      setSettings(s);
      setCurrentBalance(savedAnchorOverride ?? "");
      const nextAnchorDraft = savedAnchorOverride === null ? "" : String(savedAnchorOverride);
      anchorDraftRef.current = nextAnchorDraft;
      anchorDirtyRef.current = false;
      setAnchorDraft(nextAnchorDraft);
      setMonthAmountsState(monthKey, savedAmounts);
      setMonthAmountsLoading(true);
      setMonthBalances(savedMonthBalances);
      setClosedMonths(savedClosedMonths);
      setClosedWeeks(await budgetRepo.getClosedWeeks(monthKey));
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

  useEffect(() => {
    if (!loaded) return;
    let cancelled = false;

    void budgetRepo.getClosedWeeks(monthKey).then((savedClosedWeeks) => {
      if (!cancelled) setClosedWeeks(savedClosedWeeks);
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
    setMonthAmountsLoading(true);
    void budgetRepo.getMonthlyAmounts(currentMonthKey).then((saved) => {
      if (cancelled) return;

      const next: Record<string, Record<number, number>> = {};
    for (const item of settings.lineItems) {
      next[item.id] = next[item.id] ?? {};
      weeks.forEach((_, wi) => {
        if (itemAppliesToWeek(item.frequency, wi, weeks[wi].start, weeks[wi].end, item.anchorDate, item.anchorMonth, month)) {
          const savedVal = saved[item.id]?.[wi];
          if (savedVal !== undefined) {
            // Always preserve saved values — never overwrite with defaults
            next[item.id][wi] = savedVal;
          } else if (item.defaultAmount > 0) {
            next[item.id][wi] = item.defaultAmount;
          }
        } else {
          // Preserve saved values even for weeks the item doesn't apply to
          // This protects CC payment amounts written by closeWeek
          if (saved[item.id]?.[wi] !== undefined) {
            next[item.id][wi] = saved[item.id][wi];
          }
        }
      });
    }
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

  const forecast = useMemo(() => {
    if (!settings) {
      return null;
    }

    return buildMonthForecast({
      settings,
      amounts: visibleAmounts,
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
    visibleAmounts,
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

  const creditTotals = useMemo(() => {
    if (!settings) return [];
    return weeks.map((_, wi) => {
      const byCard: Record<string, number> = {};
      for (const item of settings.lineItems) {
        if (item.isIncome || item.paymentMethod === "checking") continue;
        if (!itemAppliesToWeek(item.frequency, wi, weeks[wi].start, weeks[wi].end, item.anchorDate, item.anchorMonth, month)) continue;
        const n = visibleAmounts[item.id]?.[wi] ?? 0;
        byCard[item.paymentMethod] = (byCard[item.paymentMethod] ?? 0) + n;
      }
      return byCard;
    });
  }, [visibleAmounts, weeks, settings, month]);

  // Category totals per week — used by collapsed rows
  const categoryWeekTotals = useMemo(() => {
    if (!settings) return {} as Record<string, number[]>;
    const result: Record<string, number[]> = {};
    for (const cat of settings.categories) {
      const catItems = settings.lineItems.filter((i) => i.category === cat);
      result[cat] = weeks.map((_, wi) => {
        let total = 0;
        for (const item of catItems) {
          if (!itemAppliesToWeek(item.frequency, wi, weeks[wi].start, weeks[wi].end, item.anchorDate, item.anchorMonth, month)) continue;
          total += visibleAmounts[item.id]?.[wi] ?? 0;
        }
        return total;
      });
    }
    return result;
  }, [visibleAmounts, weeks, settings, month]);

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
      const nextMonthKey =
        month === 11
          ? `${year + 1}-01`
          : `${year}-${String(month + 2).padStart(2, "0")}`;
      let nextAmounts: Record<string, Record<number, number>> | null = null;
      const newCharges: CCCharge[] = [];

      for (const card of settings.creditCards) {
        const chargeItems = settings.lineItems.filter(
          (item) =>
            !item.isIncome &&
            item.paymentMethod === card.id &&
            itemAppliesToWeek(item.frequency, wi, weeks[wi].start, weeks[wi].end, item.anchorDate, item.anchorMonth, month)
        );
        const total = chargeItems.reduce((sum, item) => sum + (amounts[item.id]?.[wi] ?? 0), 0);

        newCharges.push(...chargeItems
          .filter((item) => (amounts[item.id]?.[wi] ?? 0) > 0)
          .map((item) => ({
            itemId: item.id,
            itemName: item.name,
            card: card.id,
            cardLabel: card.label,
            amount: amounts[item.id]?.[wi] ?? 0,
            weekLabel: weeks[wi].label,
            dateMoved: new Date().toISOString(),
          })));

        if (total > 0) {
          nextAmounts = nextAmounts ?? await budgetRepo.getMonthlyAmounts(nextMonthKey);
          const paymentItem = findCardPaymentLine(card.label);
          if (paymentItem) {
            const existing: number = Number(nextAmounts[paymentItem.id]?.[2] ?? 0);
            nextAmounts = {
              ...nextAmounts,
              [paymentItem.id]: { ...nextAmounts[paymentItem.id], 2: existing + total },
            };
          }
        }
      }

      if (nextAmounts) {
        await budgetRepo.saveMonthlyAmounts(nextMonthKey, nextAmounts);
      }

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
        <p className="text-harbor-navy/50">Dropping anchor...</p>
      </main>
    );
  }

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
                  <div className={`text-xl font-bold ${displayedForwardBalance >= 0 ? "text-harbor-green" : "text-harbor-red"}`}>
                    {formatMoney(displayedForwardBalance)}
                  </div>
                  <p className="max-w-sm text-sm text-harbor-navy/55">
                    {isMonthClosed
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
            <div className="flex items-center gap-3 text-harbor-navy/60">
              <div className="h-4 w-4 rounded-full border-2 border-harbor-teal/25 border-t-harbor-teal animate-spin" />
              <span className="text-sm font-medium">Loading month...</span>
            </div>
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
                <th className="text-center px-2 py-3 w-24">Method</th>
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
                const items = settings.lineItems.filter((i) => i.category === cat);
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
                        className={`text-xs px-2 py-0.5 rounded-full font-medium hover:ring-2 hover:ring-offset-1 transition-all ${
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
                      const applies = itemAppliesToWeek(item.frequency, wi, weeks[wi].start, weeks[wi].end, item.anchorDate, item.anchorMonth, month);
                      const val = getAmount(item.id, wi);
                      const isReadOnlyWeek = isWeekReadOnly(wi);
                      return (
                        <td key={wi} className="px-2 py-1 text-center">
                          {applies ? (
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              disabled={isReadOnlyWeek}
                              placeholder="—"
                              value={val === 0 ? "" : val}
                              onChange={(e) => setAmount(item.id, wi, e.target.value === "" ? "" : Number(e.target.value))}
                              className={item.isIncome
                                ? "w-24 text-right rounded-lg border-l-2 border-l-harbor-green border-t border-r border-b border-slate-200 px-2 py-1 text-sm text-harbor-green focus:outline-none focus:ring-1 focus:ring-harbor-teal/20 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
                                : "w-24 text-right rounded-lg border-l-2 border-l-harbor-red border-t border-r border-b border-slate-200 px-2 py-1 text-sm text-harbor-red focus:outline-none focus:ring-1 focus:ring-harbor-red/20 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"}
                            />
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
                itemAppliesToWeek(
                  item.frequency,
                  activeWeekIdx,
                  weeks[activeWeekIdx].start,
                  weeks[activeWeekIdx].end,
                  item.anchorDate,
                  item.anchorMonth,
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
                      return (
                        <div key={item.id} className="flex items-center justify-between px-4 py-2.5 gap-3">
                          <div className="flex items-center gap-1.5 min-w-0 flex-1">
                            <span className="text-sm text-slate-700 truncate">{item.name}</span>
                            {item.isIncome && <span className="text-xs text-harbor-green font-medium flex-shrink-0">↑</span>}
                          </div>
                          <input
                            type="number"
                            inputMode="decimal"
                            min="0"
                            step="0.01"
                            disabled={isReadOnlyWeek}
                            placeholder="0"
                            value={val === 0 ? "" : val}
                            onChange={(e) => setAmount(item.id, activeWeekIdx, e.target.value === "" ? "" : Number(e.target.value))}
                            className={`w-24 text-right rounded-lg border-l-2 px-2 py-2 text-sm flex-shrink-0 focus:outline-none focus:ring-1 ${
                              item.isIncome
                                ? "border-l-harbor-green border border-slate-200 text-harbor-green focus:ring-harbor-teal/20 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
                                : "border-l-harbor-red border border-slate-200 text-harbor-red focus:ring-harbor-red/20 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
                            }`}
                          />
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
