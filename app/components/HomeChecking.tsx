"use client";
import Link from "next/link";
import { HarborLoading } from "./HarborLoading";
import { useEffect, useState } from "react";
import { loadHomeCashOutlook, saveReconciledChecking } from "../lib/home-cash-outlook";
import { pastOccurrenceStates } from "../lib/dock-reconciliation";
import { budgetRepo } from "../lib/repositories/budget-repo";
import { formatMoney, formatShortDate } from "../lib/harbor-domain";
import type { AppSettings, DockItemState } from "../lib/types";
import { ActionSheet } from "./ActionSheet";
import { FinancialInput } from "./FinancialInput";

export function HomeChecking({ settings }: { settings: AppSettings | null }) {
  const [outlook, setOutlook] = useState<Awaited<ReturnType<typeof loadHomeCashOutlook>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [past, setPast] = useState<DockItemState[] | null>(null);
  const [skippable, setSkippable] = useState<DockItemState[]>([]);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!settings) return;
      setOutlook(null); setError(null);
      try { const result = await loadHomeCashOutlook(settings); if (!cancelled) setOutlook(result); }
      catch (cause) { if (!cancelled) setError(cause instanceof Error ? cause.message : "Cash outlook could not be loaded."); }
    }
    void load(); return () => { cancelled = true; };
  }, [settings, attempt]);

  async function save() {
    if (!settings || busy || !draft.trim() || !Number.isFinite(Number(draft))) return;
    setBusy(true); setSaveError(null);
    try {
      const fresh = await loadHomeCashOutlook(settings);
      const { past: backlog } = await saveReconciledChecking(Number(draft), fresh.events);
      const today = new Date(); today.setHours(0, 0, 0, 0);
      setSkippable(pastOccurrenceStates(fresh.events, today, true));
      setPast(backlog.length ? backlog : null);
      setEditing(false); setOutlook(null); setAttempt(value => value + 1);
    } catch (cause) { setSaveError(cause instanceof Error ? cause.message : "Checking could not be saved. Please retry."); }
    finally { setBusy(false); }
  }
  async function skip() {
    setBusy(true); setSaveError(null);
    const failed: DockItemState[] = [];
    for (const state of skippable) { try { await budgetRepo.saveDockItemState(state); } catch { failed.push(state); } }
    setSkippable(failed); setBusy(false); setAttempt(value => value + 1);
    if (failed.length) setSaveError(`${failed.length} payments could not be skipped. Retry the remaining items.`);
    else setPast(null);
  }
  const negative = outlook && outlook.lowest.balance < 0;
  const scale = outlook ? Math.max(1, ...outlook.forecast.map(week => Math.abs(week.ending))) : 1;
  return <section aria-labelledby="home-checking" className="home-panel grid gap-5 p-4 sm:p-6 lg:grid-cols-[0.8fr_1.2fr]">
    <div className="lg:border-r lg:border-slate-200 lg:pr-6"><h2 id="home-checking" className="text-lg font-bold">Checking</h2>
      {outlook ? <><p className="mt-3 text-4xl font-bold tracking-tight tabular-nums">{formatMoney(outlook.balance)}</p><p className="mt-2 text-xs text-slate-500">{outlook.updatedAt ? `Updated ${new Date(outlook.updatedAt).toLocaleString()}` : "Opening balance; update to confirm"}</p></> : <div aria-label="Loading checking" className="mt-3 space-y-2"><div className="home-skeleton h-10 w-48" /><div className="home-skeleton h-4 w-56 max-w-full" />{error ? <p className="text-xs text-slate-500">Checking unavailable</p> : <HarborLoading compact label="Loading checking" />}</div>}
      <button disabled={!outlook || busy} onClick={() => { setDraft(String(outlook?.balance ?? "")); setSaveError(null); setEditing(true); }} className="mt-4 min-h-11 rounded-lg bg-harbor-teal px-4 text-sm font-semibold text-white disabled:opacity-40">Update balance</button>
    </div>
    <div><div className="mb-3 flex items-center justify-between gap-2"><h3 className="text-sm font-semibold">Cash outlook <span className="font-normal text-slate-500">(8 weeks)</span></h3><Link href="/dock" className="hidden min-h-11 items-center text-sm font-semibold text-teal-700 lg:inline-flex">View Dock &rarr;</Link></div>
      {error ? <div role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-800">{error}<button onClick={() => setAttempt(value => value + 1)} className="ml-3 min-h-11 font-semibold underline">Retry</button></div> : outlook ? <div className={`rounded-xl p-3 sm:p-4 ${negative ? "bg-rose-50" : "bg-teal-50/80"}`}>
        <p className={`text-sm font-semibold ${negative ? "text-rose-700" : "text-teal-800"}`}>{negative ? "Negative balance projected" : "No negative balance projected"}</p>
        <div className="mt-4 flex items-end gap-3"><dl className="grid flex-1 grid-cols-2 gap-3"><div><dt className="text-xs text-slate-500">Lowest balance</dt><dd data-home-low className={`mt-1 font-bold tabular-nums ${negative ? "text-rose-700" : ""}`}>{formatMoney(outlook.lowest.balance)}</dd><dd className="mt-1 text-xs text-slate-500">{formatShortDate(outlook.lowest.date)}</dd></div><div className="border-l border-slate-200 pl-3"><dt className="text-xs text-slate-500">Projected end</dt><dd data-home-end className="mt-1 font-bold tabular-nums">{formatMoney(outlook.ending)}</dd><dd className="mt-1 text-xs text-slate-500">{formatShortDate(outlook.end)}</dd></div></dl>
        <div aria-hidden="true" className="hidden h-14 w-24 items-end gap-1 sm:flex">{outlook.forecast.map((week, index) => <span key={index} className={`flex-1 rounded-t ${week.ending < 0 ? "bg-rose-300" : "bg-sky-200"}`} style={{ height: `${Math.max(5, Math.abs(week.ending) / scale * 100)}%` }} />)}</div></div>
      </div> : <div aria-label="Loading cash outlook" className="space-y-4 rounded-xl bg-slate-50 p-4"><HarborLoading compact label="Loading cash outlook" /><div className="home-skeleton h-16 w-full" /></div>}
      <Link href="/dock" className={`mt-3 inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-semibold ${negative ? "bg-rose-100 text-rose-800" : "bg-teal-50 text-teal-700 lg:hidden"}`}>{negative ? "Review in Dock" : "View Dock"} &rarr;</Link>
    </div>
    <ActionSheet open={editing} title="Update checking balance" onClose={() => { if (!busy) setEditing(false); }}><form onSubmit={event => { event.preventDefault(); void save(); }} className="space-y-4"><p className="text-sm text-slate-500">Enter your current checking balance. Today becomes the forecast starting date.</p><label className="block text-sm font-semibold">Checking balance<FinancialInput autoFocus required type="number" step="0.01" value={draft} disabled={busy} onChange={event => setDraft(event.target.value)} className="mt-2 min-h-12 w-full rounded-lg border p-3" /></label>{saveError && <p role="alert" className="text-sm text-rose-700">{saveError}</p>}<button disabled={busy || !draft.trim()} className="min-h-11 w-full rounded-lg bg-harbor-teal p-3 font-semibold text-white disabled:opacity-50">{busy ? "Saving..." : "Save balance"}</button></form></ActionSheet>
    <ActionSheet open={Boolean(past)} title="What should happen to earlier transactions?" onClose={() => { if (!busy) setPast(null); }}><p className="text-sm text-slate-500">Your checking balance is saved. {past?.length} earlier occurrences need review and are excluded from the new forecast.</p>{saveError && <p role="alert" className="text-sm text-rose-700">{saveError}</p>}<Link href="/dock#past-occurrence-review" className="min-h-11 rounded-lg bg-teal-50 p-3 font-semibold text-teal-700">Manage one by one in Dock</Link><button disabled={busy || !skippable.length} onClick={() => void skip()} className="min-h-11 rounded-lg bg-slate-50 p-3">{busy ? "Skipping..." : `Skip all past occurrences (${skippable.length})`}</button><button disabled={busy} onClick={() => setPast(null)} className="min-h-11 p-3">Keep unresolved - review later</button></ActionSheet>
  </section>;
}
