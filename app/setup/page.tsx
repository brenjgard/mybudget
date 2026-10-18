"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FinancialInput } from "../components/FinancialInput";
import { HarborLoading } from "../components/HarborLoading";
import { budgetRepo } from "../lib/repositories/budget-repo";
import { getOnboardingState, saveOnboardingState } from "../lib/onboarding-repo";
import { needsOnboarding, remainingSetup } from "../lib/onboarding-state";
import { recurringSetupItem } from "../lib/setup-records";
import type { RecurringDraft } from "../lib/setup-records";
import { formatMoney, isoDate } from "../lib/harbor-domain";
import { recurrenceLabel } from "../lib/schedule";
import type { AppSettings, CreditCardAccount, LineItem } from "../lib/types";

const STEPS = ["Welcome", "Checking", "Income", "Bills", "Credit cards", "Finish"];
const EMPTY: AppSettings = { checkingBalance: 0, checkingAccountName: "Checking", categories: [], creditCards: [], lineItems: [] };
const field = "mt-1 min-h-12 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-base focus:border-teal-500 focus:outline-2 focus:outline-teal-100";
type CardDraft = { id: string; label: string; balance: string; close: string; due: string };

export default function Setup() {
  const router = useRouter();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [step, setStep] = useState(0);
  const [ready, setReady] = useState(false);
  const [checkingSaved, setCheckingSaved] = useState(false);
  const [accountName, setAccountName] = useState("Checking");
  const [balance, setBalance] = useState("");
  const [item, setItem] = useState<RecurringDraft | null>(null);
  const [card, setCard] = useState<CardDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [saved, progress] = await Promise.all([budgetRepo.loadSettings(), getOnboardingState()]);
        if (cancelled) return;
        if (!needsOnboarding(saved, progress)) { router.replace("/home"); return; }
        if (!progress) await saveOnboardingState({ version: 1, step: 0, complete: false });
        if (cancelled) return;
        setSettings(saved ?? EMPTY); setCheckingSaved(Boolean(saved));
        setAccountName(saved?.checkingAccountName ?? "Checking");
        setBalance(saved ? String(saved.checkingBalance) : "");
        setStep(progress ? saved ? progress.step : Math.min(progress.step, 1) : 0);
        setError(null); setReady(true);
      } catch (cause) { if (!cancelled) setError(cause instanceof Error ? cause.message : "Setup could not be loaded. Please retry."); }
    }
    void load(); return () => { cancelled = true; };
  }, [router, retry]);

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError(null);
    try { await action(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Your changes could not be saved. Please retry."); }
    finally { setBusy(false); }
  }
  async function go(next: number) {
    if (item || card) { setError("Save or cancel the open item before continuing."); return; }
    await run(async () => {
      if (next > 1 && !checkingSaved) throw new Error("Add your checking account before continuing.");
      await saveOnboardingState({ version: 1, step: next, complete: false });
      setStep(next); window.scrollTo({ top: 0 });
    });
  }
  async function persist(next: AppSettings) {
    const saved = await budgetRepo.saveSettings(next);
    setSettings(saved); return saved;
  }
  function addItem(existing?: LineItem) {
    setError(null);
    setItem({ id: existing?.id ?? crypto.randomUUID(), name: existing?.name ?? "", amount: existing ? String(existing.defaultAmount) : "", frequency: (existing?.recurrence?.type as RecurringDraft["frequency"]) ?? (step === 2 ? "biweekly" : "monthly"), date: existing?.recurrence?.startDate ?? isoDate(new Date()), paymentMethod: existing?.paymentMethod ?? "checking" });
  }
  function addCard(existing?: CreditCardAccount) {
    setError(null);
    setCard({ id: existing?.id ?? crypto.randomUUID(), label: existing?.label ?? "", balance: existing ? String(existing.currentBalance ?? 0) : "", close: existing?.statementClosingDay ? String(existing.statementClosingDay) : "", due: existing?.paymentDueDay ? String(existing.paymentDueDay) : "" });
  }
  const income = step === 2;
  const items = settings?.lineItems.filter(row => row.isIncome === income) ?? [];

  return <main className="min-h-screen bg-sky-50/70 px-3 py-5 text-harbor-navy sm:px-6 sm:py-10">
    <div className="mx-auto max-w-2xl overflow-hidden rounded-2xl border border-sky-100 bg-white shadow-sm">
      {(step === 0 || step === 5) && <div className="home-coastal-header flex min-h-40 items-start p-5"><span className="flex items-center gap-2 text-xl font-bold"><Image src="/harbor-logo.svg" alt="" width={35} height={35} />Harbor</span></div>}
      <div className="p-5 sm:p-8">
        <div className="mb-6" aria-label="Setup progress"><p className="text-xs font-semibold text-slate-500">Step {step + 1} of 6 <span className="ml-2">{STEPS[step]}</span></p><ol className="mt-2 grid grid-cols-6 gap-2">{STEPS.map((label, index) => <li key={label} aria-current={index === step ? "step" : undefined} aria-label={label} className={"h-1.5 rounded-full " + (index <= step ? "bg-teal-600" : "bg-slate-100")} />)}</ol></div>
        {error && <p role="alert" className="mb-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}{!ready && <button className="ml-2 min-h-11 underline" onClick={() => setRetry(value => value + 1)}>Retry</button>}</p>}
        {!ready || !settings ? <HarborLoading label="Loading setup" /> : <>
          {step === 0 && <><h1 className="text-2xl font-bold">Welcome to Harbor</h1><p className="mt-2 text-slate-500">A calmer way to plan, track, and see what&apos;s ahead.</p><ul className="my-8 space-y-5">{[["Know where you stand", "See your checking balance and what's ahead."], ["Plan with confidence", "Track bills, income, and spending in one place."], ["Stay on course", "See potential cash-flow problems before they happen."]].map(([title, description]) => <li key={title}><h2 className="font-semibold">{title}</h2><p className="mt-1 text-sm text-slate-500">{description}</p></li>)}</ul><p className="text-sm text-slate-500">Start with checking. Everything else can wait.</p></>}
          {step === 1 && <><h1 className="text-2xl font-bold">Add your checking account</h1><p className="mt-2 text-sm text-slate-500">This is the account you use to pay your bills. Harbor will use it to track your balance and forecast what&apos;s coming.</p><form id="checking-setup" className="mt-6 space-y-4" onSubmit={event => { event.preventDefault(); void run(async () => {
            const amount = Number(balance);
            if (!accountName.trim() || !balance.trim() || !Number.isFinite(amount)) throw new Error("Enter an account name and a valid current balance.");
            await persist({ ...settings, checkingAccountName: accountName.trim(), checkingBalance: amount });
            await budgetRepo.saveCheckingAnchor(amount);
            setCheckingSaved(true);
            await saveOnboardingState({ version: 1, step: 2, complete: false });
            setStep(2);
          }); }}><label className="block text-sm font-medium">Account name<input required disabled={busy} className={field} value={accountName} onChange={event => setAccountName(event.target.value)} /></label><label className="block text-sm font-medium">Current balance<FinancialInput required disabled={busy} type="number" step="0.01" className={field} value={balance} onChange={event => setBalance(event.target.value)} /></label></form><p className="mt-6 rounded-lg bg-sky-50 p-3 text-sm text-slate-500">You can update this anytime. A zero or negative balance is okay.</p></>}
          {(step === 2 || step === 3) && <><h1 className="text-2xl font-bold">{income ? "Add your income" : "Add your bills and recurring payments"}</h1><p className="mt-2 text-sm text-slate-500">{income ? "Add regular income so Harbor can plan ahead. You can add multiple sources." : "Start with the monthly essentials. You can always add more later."}</p>
            <ul className="mt-5 space-y-2">{items.map(row => <li key={row.id} className="rounded-xl border border-slate-200 p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="break-words font-semibold">{row.name}</h2><p className="mt-1 text-xs text-slate-500">{formatMoney(row.defaultAmount)} &middot; {row.recurrence ? recurrenceLabel(row.recurrence) : row.frequency} &middot; {row.paymentMethod === "checking" ? accountName : settings.creditCards.find(c => c.id === row.paymentMethod)?.label}</p></div><div className="flex shrink-0 gap-1"><button disabled={busy || Boolean(item)} aria-label={"Edit " + row.name} onClick={() => addItem(row)} className="min-h-11 px-2 text-xs font-semibold text-teal-700">Edit</button><button disabled={busy || Boolean(item)} aria-label={"Remove " + row.name} onClick={() => void run(async () => { await persist({ ...settings, lineItems: settings.lineItems.filter(candidate => candidate.id !== row.id) }); })} className="min-h-11 px-2 text-xs text-rose-700">Remove</button></div></div></li>)}</ul>
            {item ? <form className="mt-4 space-y-4 rounded-xl bg-slate-50 p-4" onSubmit={event => { event.preventDefault(); void run(async () => {
              const record = recurringSetupItem(item, income);
              await persist({ ...settings, categories: [...new Set([...settings.categories, record.category])], lineItems: [...settings.lineItems.filter(row => row.id !== record.id), record] }); setItem(null);
            }); }}><label className="block text-sm font-medium">Name<input required autoFocus disabled={busy} className={field} value={item.name} onChange={event => setItem({ ...item, name: event.target.value })} /></label><label className="block text-sm font-medium">Amount<FinancialInput required min="0.01" step="0.01" type="number" disabled={busy} className={field} value={item.amount} onChange={event => setItem({ ...item, amount: event.target.value })} /></label><div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm font-medium">Frequency<select disabled={busy} className={field} value={item.frequency} onChange={event => setItem({ ...item, frequency: event.target.value as RecurringDraft["frequency"] })}>{[["weekly", "Weekly"], ["biweekly", "Every two weeks"], ["monthly", "Monthly"], ["quarterly", "Every three months"], ["annual", "Yearly"]].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="block text-sm font-medium">{income ? "Next expected date" : "Next due date"}<input required disabled={busy} type="date" className={field} value={item.date} onChange={event => setItem({ ...item, date: event.target.value })} /></label></div>{!income && <label className="block text-sm font-medium">Pay from<select disabled={busy} className={field} value={item.paymentMethod} onChange={event => setItem({ ...item, paymentMethod: event.target.value })}><option value="checking">{accountName}</option>{settings.creditCards.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>}<div className="flex gap-3"><button disabled={busy} className="min-h-11 rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white">{busy ? "Saving..." : income ? "Save income" : "Save bill"}</button><button type="button" disabled={busy} onClick={() => setItem(null)} className="min-h-11 px-3 text-sm">Cancel</button></div></form> : <button disabled={busy} onClick={() => addItem()} className="mt-4 min-h-11 rounded-lg bg-teal-50 px-4 text-sm font-semibold text-teal-800">+ {income ? "Add another income source" : "Add another bill"}</button>}
            <p className="mt-6 text-sm text-slate-500">You can skip this for now. Your forecast will be more complete when {income ? "income is" : "bills are"} added.</p>
          </>}
          {step === 4 && <><h1 className="text-2xl font-bold">Add your credit cards</h1><p className="mt-2 text-sm text-slate-500">Add your cards and current balances. Statement dates help projections, but you can add them later.</p><ul className="mt-5 space-y-2">{settings.creditCards.map(row => <li key={row.id} className="flex items-center justify-between gap-3 rounded-xl border p-3"><div className="min-w-0"><h2 className="break-words font-semibold">{row.label}</h2><p className="text-sm text-slate-500">{formatMoney(row.currentBalance ?? 0)}</p></div><div className="flex"><button disabled={busy || Boolean(card)} onClick={() => addCard(row)} className="min-h-11 px-2 text-xs font-semibold text-teal-700">Edit</button><button disabled={busy || Boolean(card)} onClick={() => void run(async () => { if (settings.lineItems.some(row2 => row2.paymentMethod === row.id)) throw new Error("Change bills using this card to another account before removing it."); await persist({ ...settings, creditCards: settings.creditCards.filter(c => c.id !== row.id) }); })} className="min-h-11 px-2 text-xs text-rose-700">Remove</button></div></li>)}</ul>
            {card ? <form className="mt-4 space-y-4 rounded-xl bg-slate-50 p-4" onSubmit={event => { event.preventDefault(); void run(async () => {
              const amount = Number(card.balance);
              if (!card.label.trim() || !card.balance.trim() || !Number.isFinite(amount) || amount < 0) throw new Error("Enter a card name and a non-negative balance.");
              for (const day of [card.close, card.due]) if (day && (!Number.isInteger(Number(day)) || Number(day) < 1 || Number(day) > 31)) throw new Error("Statement days must be between 1 and 31, or left blank.");
              await persist({ ...settings, creditCards: [...settings.creditCards.filter(row => row.id !== card.id), { id: card.id, label: card.label.trim(), currentBalance: amount, currentBalanceUpdatedAt: new Date().toISOString(), statementClosingDay: card.close ? Number(card.close) : undefined, paymentDueDay: card.due ? Number(card.due) : undefined }] }); setCard(null);
            }); }}><label className="block text-sm font-medium">Card name<input autoFocus required disabled={busy} className={field} value={card.label} onChange={event => setCard({ ...card, label: event.target.value })} /></label><label className="block text-sm font-medium">Current card balance<FinancialInput required min="0" step="0.01" type="number" disabled={busy} className={field} value={card.balance} onChange={event => setCard({ ...card, balance: event.target.value })} /></label><div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm font-medium">Statement close day (optional)<input inputMode="numeric" type="number" min="1" max="31" disabled={busy} className={field} value={card.close} onChange={event => setCard({ ...card, close: event.target.value })} /></label><label className="block text-sm font-medium">Payment due day (optional)<input inputMode="numeric" type="number" min="1" max="31" disabled={busy} className={field} value={card.due} onChange={event => setCard({ ...card, due: event.target.value })} /></label></div><div className="flex gap-3"><button disabled={busy} className="min-h-11 rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white">{busy ? "Saving..." : "Save card"}</button><button type="button" disabled={busy} onClick={() => setCard(null)} className="min-h-11 px-3 text-sm">Cancel</button></div></form> : <button disabled={busy} onClick={() => addCard()} className="mt-4 min-h-11 rounded-lg bg-teal-50 px-4 text-sm font-semibold text-teal-800">+ Add another card</button>}<p className="mt-6 text-sm text-slate-500">No credit cards? You can skip this step. Unknown statement dates can be added later in Fleet.</p>
          </>}
          {step === 5 && <><h1 className="text-2xl font-bold">You&apos;re ready to start</h1><p className="mt-2 text-sm text-slate-500">Your checking account is ready. Harbor will build on the details you add over time.</p><ul className="my-6 space-y-3 rounded-xl bg-teal-50 p-4">{[["Checking account", checkingSaved], ["Income", settings.lineItems.some(row => row.isIncome)], ["Bills and recurring payments", settings.lineItems.some(row => !row.isIncome)], ["Credit cards", settings.creditCards.length > 0]].map(([label, complete]) => <li key={String(label)} className="text-sm"><span className={complete ? "font-semibold text-teal-800" : "text-slate-500"}>{String(label)} {complete ? "added" : "- add later if needed"}</span></li>)}</ul>{remainingSetup(settings).length > 0 && <><h2 className="font-semibold">Finish setting up Harbor</h2><p className="mt-1 text-sm text-slate-500">Optional next steps, available from Home and Settings:</p><ul className="mt-3 space-y-2 text-sm text-slate-500">{remainingSetup(settings).map(task => <li key={task.label}>{task.label}</li>)}</ul></>}</>}
          <footer className="sticky bottom-0 -mx-5 mt-8 flex flex-wrap items-center gap-3 border-t border-slate-100 bg-white/95 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 backdrop-blur sm:-mx-8 sm:px-8">
            {step > 0 && <button disabled={busy || Boolean(item || card)} onClick={() => void go(step - 1)} className="min-h-12 rounded-lg bg-slate-50 px-5 text-sm font-semibold disabled:opacity-40">Back</button>}
            {step === 1 ? <button form="checking-setup" disabled={busy} className="min-h-12 flex-1 rounded-lg bg-harbor-navy px-5 text-sm font-semibold text-white disabled:opacity-40">{busy ? "Saving..." : "Continue"}</button> : <button disabled={busy || Boolean(item || card)} onClick={() => step === 5 ? void run(async () => { if (!checkingSaved) throw new Error("Checking is required."); await saveOnboardingState({ version: 1, step: 5, complete: true }); router.replace("/home"); router.refresh(); }) : void go(step + 1)} className="min-h-12 flex-1 rounded-lg bg-harbor-navy px-5 text-sm font-semibold text-white disabled:opacity-40">{busy ? "Saving..." : step === 0 ? "Let's get started" : step === 5 ? "Go to Home" : "Continue"}</button>}
            {step >= 2 && step <= 4 && <button disabled={busy || Boolean(item || card)} onClick={() => void go(step + 1)} className="min-h-11 w-full text-sm font-semibold text-teal-700 disabled:opacity-40">Skip for now</button>}
          </footer>
        </>}
      </div>
    </div>
  </main>;
}
