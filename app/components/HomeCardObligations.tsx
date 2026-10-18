"use client";

import Link from "next/link";
import { HarborLoading } from "./HarborLoading";
import { ActionSheet } from "./ActionSheet";
import { FinancialInput } from "./FinancialInput";
import { expectedCardBalance } from "../lib/card-payments";
import { homeCardSummary } from "../lib/home-card-summary";
import { useEffect, useState } from "react";
import { budgetRepo } from "../lib/repositories/budget-repo";
import { buildProjectedAmounts } from "../lib/schedule";
import { mergeDockEvents } from "../lib/dock-view";
import { buildCardObligations, buildCashEvents, cardCycleForDate, formatMoney, formatShortDate, getCalendarWeeksForMonth, monthKeyFor, parseDateOnly } from "../lib/harbor-domain";
import type { HarborCardObligation } from "../lib/harbor-domain";
import type { AppSettings, DockItemState, SpendLogEntry, CreditCardAccount } from "../lib/types";

export function HomeCardObligations({ settings, onSettingsChange }: { settings: AppSettings; onSettingsChange: (settings: AppSettings) => void }) {
  const [loadedObligations, setObligations] = useState<HarborCardObligation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activity, setActivity] = useState<{ states: DockItemState[]; logs: SpendLogEntry[] }>({ states: [], logs: [] });
  const [checkIn, setCheckIn] = useState<CreditCardAccount | null>(null);
  const [balanceDraft, setBalanceDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setError(null);
      try {
        const today = new Date();
        const cycles = settings.creditCards.map(card => cardCycleForDate(card, parseDateOnly(card.currentBalanceUpdatedAt) ?? today));
        // Include each saved card cycle, its payment month, and moved unresolved records.
        const earliest = await budgetRepo.getEarliestUnresolvedDockMonth();
        const start = new Date(Math.min(new Date(today.getFullYear(), today.getMonth() - 2, 1).getTime(), ...cycles.map(cycle => cycle.cycleStart.getTime()), ...(earliest ? [new Date(`${earliest}-01T00:00:00`).getTime()] : [])));
        const end = new Date(Math.max(new Date(today.getFullYear(), today.getMonth() + 3, 0).getTime(), ...cycles.map(cycle => cycle.dueDate.getTime())));
        const months: Date[] = [];
        for (const date = new Date(start.getFullYear(), start.getMonth(), 1); date <= end; date.setMonth(date.getMonth() + 1)) months.push(new Date(date));
        const records = await Promise.all(months.map(async date => {
          const month = date.getMonth();
          const monthKey = monthKeyFor(date.getFullYear(), month);
          const weeks = getCalendarWeeksForMonth(date.getFullYear(), month);
          const [amounts, spendLogs, dockStates] = await Promise.all([budgetRepo.getMonthlyAmounts(monthKey), budgetRepo.getSpendLogs(monthKey), budgetRepo.getDockItemStates(monthKey)]);
          return { month, monthKey, weeks, amounts: buildProjectedAmounts(settings, weeks, month, amounts), spendLogs, dockStates };
        }));
        const logs = records.flatMap(record => record.spendLogs);
        const states = records.flatMap(record => record.dockStates);
        const events = mergeDockEvents(records.flatMap(record => buildCashEvents({ ...record, settings, buoys: [], cardSpendLogs: logs, cardPaymentStates: states })), states);
        const result = buildCardObligations(settings, monthKeyFor(today.getFullYear(), today.getMonth()), logs, events).sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
        // Keep zero-balance cards available for check-in as well.
        for (const card of settings.creditCards) {
          if (result.some(row => row.card.id === card.id)) continue;
          const cycle = cardCycleForDate(card, parseDateOnly(card.currentBalanceUpdatedAt) ?? today);
          result.push({ card, ...cycle, anchorAmount: 0, newSpending: 0, allocatedClosedObligations: 0, amount: 0, scheduled: 0, remaining: 0, payments: [] });
        }
        result.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
        if (!cancelled) { setObligations(result); setActivity({ states, logs }); }
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Card obligations could not be loaded.");
      }
    }
    if (settings.creditCards.length) void load();
    return () => { cancelled = true; };
  }, [settings, attempt]);

  function openCheckIn(card: CreditCardAccount) {
    setCheckIn(card); setBalanceDraft(""); setSaveError(null); setNotice(null);
  }

  async function saveCheckIn() {
    const amount = Number(balanceDraft);
    if (!checkIn || saving || !balanceDraft.trim() || !Number.isFinite(amount) || amount < 0) return;
    setSaving(true); setSaveError(null);
    try {
      // Read fresh settings so a check-in cannot overwrite a more recent Fleet edit.
      const latest = await budgetRepo.loadSettings();
      if (!latest?.creditCards.some(card => card.id === checkIn.id)) throw new Error("This card is no longer available. Refresh Home.");
      const snapshot = await budgetRepo.saveCardBalance(checkIn.id, amount);
      const saved = { ...latest, creditCards: latest.creditCards.map(card => card.id === checkIn.id ? { ...card, currentBalance: snapshot.balance, currentBalanceUpdatedAt: snapshot.updatedAt } : card) };
      setObligations(null);
      onSettingsChange(saved);
      setNotice(checkIn.label + " checked in. Balance saved as " + formatMoney(amount) + ".");
      setCheckIn(null);
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : "The balance could not be saved. Please retry.");
    } finally { setSaving(false); }
  }

  const obligations = settings.creditCards.length ? loadedObligations : [];
  const summary = homeCardSummary(obligations ?? [], activity.states);
  const expected = checkIn ? expectedCardBalance(checkIn, activity.logs, activity.states) : 0;
  const difference = balanceDraft.trim() && Number.isFinite(Number(balanceDraft)) ? Number(balanceDraft) - expected : null;
  const statusClass = { "Statement still to pay": "bg-rose-50 text-rose-700", "Payment scheduled": "bg-blue-50 text-blue-700", "Paid": "bg-emerald-50 text-emerald-700", "Projected next cycle": "bg-violet-50 text-violet-700" };
  return <section aria-labelledby="home-card-obligations" className="space-y-5 rounded-2xl border border-sky-100 bg-white p-4 shadow-sm sm:p-6">
    <div className="flex items-start justify-between gap-3">
      <div><h2 id="home-card-obligations" className="text-lg font-bold sm:text-xl">Credit cards</h2><p className="mt-1 text-xs text-slate-500 sm:text-sm">Keep your balances current and see what&apos;s coming up.</p></div>
      <Link href="/fleet" className="inline-flex min-h-11 shrink-0 items-center text-sm font-semibold text-teal-700">View Fleet &rarr;</Link>
    </div>
    {notice && <p role="status" className="rounded-xl border border-teal-200 bg-teal-50 p-4 text-sm text-teal-800">{notice}</p>}
    <ActionSheet open={Boolean(checkIn)} title={checkIn ? "Check in: " + checkIn.label : "Card check-in"} onClose={() => { if (!saving) setCheckIn(null); }}>
      <form onSubmit={event => { event.preventDefault(); void saveCheckIn(); }} className="space-y-4">
        <p className="text-sm text-slate-500">Enter the current balance shown by your card provider. This updates today&apos;s balance snapshot; it does not mark a statement paid or change checking.</p>
        <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Expected from recorded activity</p><p className="mt-1 text-2xl font-bold tabular-nums">{formatMoney(expected)}</p></div>
        <label className="block text-sm font-semibold">Current card balance<FinancialInput autoFocus required min="0" step="0.01" type="number" value={balanceDraft} disabled={saving} onChange={event => setBalanceDraft(event.target.value)} className="mt-2 min-h-12 w-full rounded-lg border border-slate-300 p-3 text-lg" /></label>
        {difference !== null && <p className="text-sm text-slate-500">{Math.abs(difference) < 0.005 ? "Matches your recorded activity." : formatMoney(Math.abs(difference)) + (difference > 0 ? " higher" : " lower") + " than expected. Check for purchases, payments, fees or refunds not yet recorded."}</p>}
        {saveError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{saveError}</p>}
        <button type="submit" disabled={saving || !balanceDraft.trim() || !Number.isFinite(Number(balanceDraft)) || Number(balanceDraft) < 0} className="min-h-12 w-full rounded-lg bg-harbor-teal p-3 font-semibold text-white disabled:opacity-50">{saving ? "Saving..." : "Save check-in"}</button>
      </form>
    </ActionSheet>
    <ul className="grid divide-y divide-slate-100 lg:grid-cols-3 lg:gap-3 lg:divide-y-0">{settings.creditCards.map(card => {
      const updated = card.currentBalanceUpdatedAt ? new Date(card.currentBalanceUpdatedAt) : null;
      const today = new Date();
      const days = updated && !Number.isNaN(updated.getTime()) ? Math.max(0, Math.round((Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) - Date.UTC(updated.getFullYear(), updated.getMonth(), updated.getDate())) / 86400000)) : null;
      const freshness = days === null ? "Balance needs updating" : days === 0 ? "Updated today" : days === 1 ? "Updated yesterday" : "Updated " + days + " days ago";
      return <li key={card.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-3 lg:block lg:rounded-xl lg:border lg:border-slate-100 lg:p-4"><div className="min-w-0"><h3 className="break-words text-sm font-semibold">{card.label}</h3><p className="mt-1 text-xl font-bold tabular-nums">{formatMoney(card.currentBalance ?? 0)}</p><p className={"mt-1 text-xs " + (days === 0 ? "text-teal-700" : days === null || days >= 3 ? "text-amber-700" : "text-slate-500")}>{freshness}</p></div><button disabled={!loadedObligations || Boolean(error)} aria-label={"Update balance for " + card.label} onClick={() => openCheckIn(card)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-teal-300 bg-teal-100 px-3 text-sm font-semibold text-teal-900 shadow-sm transition-colors hover:border-teal-500 hover:bg-teal-200 active:bg-teal-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:cursor-not-allowed disabled:opacity-40 lg:mt-3 lg:w-full"><svg aria-hidden="true" className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m16 3 5 5-12 12-6 1 1-6L16 3ZM13 6l5 5" /></svg><span className="lg:hidden">Update</span><span className="hidden lg:inline">Update balance</span></button></li>;
    })}</ul>
    {error ? <div role="alert" className="rounded-xl border border-red-100 bg-red-50 p-5 text-sm text-red-700">{error}<button onClick={() => setAttempt(value => value + 1)} className="ml-3 min-h-11 font-semibold underline">Retry</button></div>
      : obligations === null ? <div className="rounded-2xl border border-slate-200 bg-white p-6"><HarborLoading compact label="Loading card payments" /></div>
      : obligations.length === 0 ? <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8"><h3 className="text-lg font-semibold">{settings.creditCards.length ? "No card obligations to show" : "Your cards, in one place"}</h3><p className="mt-2 max-w-lg text-sm leading-relaxed text-slate-500">{settings.creditCards.length ? "Projected card payments will appear here as balances and spending are recorded." : "Add a card in Fleet to see its projected payment, due date and spending breakdown here."}</p></div>
      : <>
        <div className="divide-y divide-slate-200 rounded-xl bg-slate-50 lg:grid lg:grid-cols-3 lg:divide-x lg:divide-y-0">
          <Link href="/fleet" data-summary="still-to-pay" className="flex min-h-20 items-center justify-between gap-3 p-3 lg:block lg:p-4"><div><p className="text-xs text-slate-500">Statements to pay</p><p className="mt-1 text-xs text-slate-500">{summary.stillToPay ? "Needs action" : "No statements need attention"}</p></div>{summary.stillToPay > 0 && <strong className="text-lg tabular-nums lg:mt-2 lg:block">{formatMoney(summary.stillToPay)}</strong>}</Link>
          <Link href="/fleet" data-summary="scheduled" className="flex min-h-20 items-center justify-between gap-3 p-3 lg:block lg:p-4"><div><p className="text-xs text-slate-500">Payments scheduled</p><p className="mt-1 text-xs text-slate-500">{summary.scheduled ? summary.paymentCount + (summary.paymentCount === 1 ? " payment" : " payments") : "No payments scheduled"}</p></div>{summary.scheduled > 0 && <strong className="text-lg tabular-nums lg:mt-2 lg:block">{formatMoney(summary.scheduled)}</strong>}</Link>
          <Link href={summary.next ? "/fleet?card=" + encodeURIComponent(summary.next.cardId) : "/fleet"} className="flex min-h-20 items-center justify-between gap-3 p-3 lg:block lg:p-4"><div><p className="text-xs text-slate-500">{summary.next?.status === "Projected next cycle" ? "Next projected payment" : "Next payment"}</p><p className="mt-1 text-xs text-slate-500">{summary.next ? summary.next.label + " - " + formatShortDate(new Date(summary.next.date + "T00:00:00")) : "Nothing upcoming"}</p></div>{summary.next && <strong className="text-lg tabular-nums lg:mt-2 lg:block">{summary.next.status === "Projected next cycle" ? "~" : ""}{formatMoney(summary.next.amount)}</strong>}</Link>
        </div>
        <h3 className="text-sm font-bold">Upcoming payments</h3>
        {summary.rows.filter(row => row.status !== "Paid").length ? <ul className="overflow-hidden rounded-xl border border-slate-100 divide-y divide-slate-100">{summary.rows.filter(row => row.status !== "Paid").slice(0, 5).map(row => <li key={row.id}>
          <Link href={"/fleet?card=" + encodeURIComponent(row.cardId)} className="grid min-h-20 grid-cols-[minmax(0,1fr)_auto_12px] items-center gap-2 px-3 py-3 hover:bg-sky-50/60 lg:grid-cols-[minmax(0,1fr)_minmax(150px,1fr)_110px_120px_12px] lg:gap-4 lg:px-4">
            <div className="min-w-0"><p className="break-words text-sm font-semibold">{row.label}</p><span className={"mt-1 inline-block rounded-md px-2 py-1 text-[10px] font-medium lg:hidden " + statusClass[row.status]}>{row.status === "Statement still to pay" ? "Statement to pay" : row.status}</span></div>
            <span className={"hidden w-fit rounded-lg px-2 py-1 text-xs font-medium lg:block " + statusClass[row.status]}>{row.status === "Statement still to pay" ? "Statement to pay" : row.status}</span>
            <div className="hidden text-xs text-slate-500 lg:block">{row.status === "Paid" ? "Statement due" : "Due"}<p className="mt-1 text-harbor-navy">{row.date ? formatShortDate(new Date(row.date + "T00:00:00")) : "Not set"}</p></div>
            <div className="text-right"><p className="text-sm font-bold tabular-nums">{row.status === "Projected next cycle" ? "~" : ""}{formatMoney(row.amount)}</p><p className="mt-1 text-[11px] text-slate-500 lg:hidden">{row.date ? formatShortDate(new Date(row.date + "T00:00:00")) : "Date not set"}</p></div><span aria-hidden="true" className="text-slate-400">&rsaquo;</span>
          </Link>
        </li>)}</ul> : <p className="text-sm text-slate-500">No upcoming payments. </p>}

      </>}
  </section>;
}
