"use client";

import { dockRisk } from "../lib/dock-risk";
import { Fragment, useId, useState } from "react";
import { FinancialInput } from "./FinancialInput";
import { budgetActions } from "../lib/budget-actions";
import { formatMoney, formatShortDate, isoDate } from "../lib/harbor-domain";
import { weekProjection } from "../lib/dock-view";
import type { HarborCashEvent, HarborWeekForecast } from "../lib/harbor-domain";
import type { LineItem } from "../lib/types";

type Props = {
  week: HarborWeekForecast;
  completed: HarborCashEvent[];
  items: LineItem[];
  saving: Record<string, boolean>;
  onDone: (event: HarborCashEvent, done: boolean) => Promise<boolean>;
  onSkip: (event: HarborCashEvent) => Promise<boolean>;
  onUpdate: (event: HarborCashEvent, amount: number, date?: string) => Promise<boolean>;
  onAdd: (date: Date) => void;
  onSpend: (event: HarborCashEvent) => void;
};

export function DesktopDockWeek({ week, completed, items, saving, onDone, onSkip, onUpdate, onAdd, onSpend }: Props) {
  const [selection, setSelection] = useState<string[]>([]);
  const [edit, setEdit] = useState<{ ids: string[]; mode: "move" | "amount"; value: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const events = [...week.events, ...completed].sort((a, b) => a.date.getTime() - b.date.getTime() || (a.kind === "income" ? 0 : 1) - (b.kind === "income" ? 0 : 1) || a.label.localeCompare(b.label));
  const selected = week.events.filter((event) => selection.includes(event.id));
  const balances = new Map(weekProjection(week).filter((point) => point.event).map((point) => [point.event!.id, point.balance]));
  const largest = week.events.filter((event) => event.kind !== "income").sort((a, b) => b.amount - a.amount)[0];
  const labelFor = (event: HarborCashEvent) => {
    const item = items.find((candidate) => candidate.id === event.itemId);
    return event.kind === "income" ? "Received" : event.kind === "transfer" ? "Transferred" : event.kind === "cardPayment" ? "Paid" : item ? budgetActions(item, event.state, 0).recordedLabel : "Paid";
  };
  function openEdit(events: HarborCashEvent[], mode: "move" | "amount") {
    setMessage("");
    setEdit({ ids: events.map((event) => event.id), mode, value: mode === "move" ? isoDate(events[0].date) : events[0].amount.toFixed(2) });
  }
  async function apply(skip = false) {
    const targets = skip ? selected : week.events.filter((event) => edit?.ids.includes(event.id));
    setBusy(true); setMessage("");
    const failed: string[] = [];
    for (const event of targets) {
      const ok = skip ? await onSkip(event) : await onUpdate(event, edit?.mode === "amount" ? Number(edit.value) : event.amount, edit?.mode === "move" ? edit.value : undefined);
      if (!ok) failed.push(event.id);
    }
    setBusy(false); setSelection(failed);
    if (!failed.length) setEdit(null);
    setMessage(failed.length ? `${failed.length} change(s) could not be saved. Review the error above and retry.` : `${targets.length} occurrence(s) ${skip ? "skipped" : "updated"}.`);
  }
  return <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" id="dock-selected-week" aria-label="Selected week detail">
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-3"><h2 className="text-xl font-bold">{week.week.label}, {week.week.start.getFullYear()}</h2><span className={`rounded-full px-3 py-1 text-xs font-semibold ${dockRisk(week.lowest).badge}`}>{dockRisk(week.lowest).label}</span></div>
        <dl className="mt-3 grid grid-cols-5 gap-3 text-xs">{[["Starting balance", week.starting], ["Total in", week.inflows], ["Total out", -week.outflows], ["Ending balance", week.ending], ["Low Point", week.lowest]].map(([label, amount]) => <div key={label}><dt className="text-slate-500">{label}</dt><dd className={`mt-1 text-sm font-bold tabular-nums ${label === "Low Point" ? dockRisk(week.lowest).text + " text-lg" : label === "Ending balance" ? "text-harbor-navy" : Number(amount) < 0 ? "text-red-600" : ""}`}>{formatMoney(Number(amount))}</dd></div>)}</dl>
      </div>
      <aside className="w-56 shrink-0 rounded-lg bg-slate-50 p-3 text-xs"><strong>Week at a glance</strong><p className="mt-1 text-slate-600">{largest ? `Largest outflow: ${largest.label} (${formatMoney(largest.amount)})` : "No planned outflows"}</p><p className="mt-1">{week.events.length} of {events.length} transactions remaining</p></aside>
    </div>
    <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full text-left text-xs"><caption className="sr-only">Transactions and projected checking balances for {week.week.label}</caption>
        <thead className="bg-slate-50 text-slate-500"><tr><th className="p-2"><input type="checkbox" aria-label="Select all upcoming transactions" checked={week.events.length > 0 && selected.length === week.events.length} disabled={!week.events.length || busy} onChange={(event) => setSelection(event.target.checked ? week.events.map((row) => row.id) : [])} /></th>{["Date", "Description", "Category", "Amount", "Running balance (projected)", "Status", "Actions"].map((label) => <th key={label} scope="col" className="px-2 py-3 font-medium">{label}</th>)}</tr></thead>
        <tbody>{events.map((event) => {
          const recorded = labelFor(event), done = event.status === "done", disabled = busy || saving[event.id];
          const editing = edit?.ids.length === 1 && edit.ids[0] === event.id;
          return <Fragment key={event.id}><tr className={`border-t border-slate-100 ${selection.includes(event.id) ? "bg-teal-50/60" : ""}`}>
            <td className="p-2">{!done && <input type="checkbox" aria-label={`Select ${event.label} on ${formatShortDate(event.date)}`} checked={selection.includes(event.id)} disabled={disabled} onChange={(change) => setSelection((current) => change.target.checked ? [...current, event.id] : current.filter((id) => id !== event.id))} />}</td>
            <td className="whitespace-nowrap p-2">{event.date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</td>
            <td className="p-2 font-semibold">{event.label}</td><td className="p-2"><span className="rounded bg-slate-100 px-2 py-1">{event.chart || (event.kind === "transfer" ? "Savings" : event.kind === "income" ? "Income" : "Payments")}</span></td>
            <td className={`whitespace-nowrap p-2 text-right font-semibold tabular-nums ${event.kind === "income" ? "text-emerald-700" : "text-red-600"}`}>{event.kind === "income" ? "+" : "-"}{formatMoney(event.amount)}</td>
            <td className="p-2 text-right font-semibold tabular-nums">{balances.has(event.id) ? formatMoney(balances.get(event.id)!) : <span className="font-normal text-slate-500">Recorded</span>}</td>
            <td className="p-2"><span className={`whitespace-nowrap rounded px-2 py-1 ${done ? "bg-teal-50 text-teal-700" : "bg-blue-50 text-blue-700"}`}>{done ? recorded : event.state?.status === "adjusted" ? "Adjusted" : "Scheduled"}</span></td>
            <td className="p-2"><div className="flex items-center gap-1">{!done ? <>
              <button disabled={disabled} className="min-h-9 whitespace-nowrap rounded border border-teal-100 px-2 font-semibold text-teal-700 disabled:opacity-40" onClick={() => recorded === "Spent" ? onSpend(event) : void onDone(event, true)}>{recorded === "Spent" ? "Log Spend" : `Mark ${recorded}`}</button>
              <button disabled={disabled} aria-label={`Move ${event.label}`} title="Move date" className="min-h-9 min-w-9 rounded hover:bg-slate-100" onClick={() => openEdit([event], "move")}><DockIcon kind="calendar" /></button>
              <button disabled={disabled} aria-label={`Edit amount for ${event.label}`} title="Edit amount" className="min-h-9 min-w-9 rounded hover:bg-slate-100" onClick={() => openEdit([event], "amount")}><DockIcon kind="edit" /></button>
              <button disabled={disabled} aria-label={`Skip ${event.label}`} title="Skip occurrence" className="min-h-9 min-w-9 rounded hover:bg-slate-100" onClick={() => void onSkip(event)}><DockIcon kind="skip" /></button>
            </> : event.state?.status === "cleared" && <button disabled={disabled} onClick={() => void onDone(event, false)} className="min-h-9 px-2 text-teal-700">Undo</button>}</div></td>
          </tr>{editing && <tr><td colSpan={8} className="bg-teal-50 p-3"><OccurrenceEditor edit={edit} busy={busy} onChange={(value) => setEdit({ ...edit, value })} onSave={() => void apply()} onCancel={() => setEdit(null)} /></td></tr>}</Fragment>;
        })}{!events.length && <tr><td colSpan={8} className="p-6 text-center text-slate-500">No transactions in this week.</td></tr>}</tbody>
      </table>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-slate-50/50 p-3">
        <button onClick={() => onAdd(week.week.start)} className="rounded-lg border border-teal-100 bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-700">+ Add transaction to this week</button>
        <div className="flex items-center gap-2 text-xs"><span className="text-slate-500">{selected.length ? `${selected.length} selected` : "Select transactions for quick actions"}</span><button disabled={!selected.length || busy} onClick={() => openEdit(selected, "move")} className="rounded border bg-white px-3 py-2 disabled:opacity-40">Move</button><button disabled={!selected.length || busy} onClick={() => void apply(true)} className="rounded border bg-white px-3 py-2 disabled:opacity-40">Skip</button><button disabled={selected.length !== 1 || busy} title="Select one transaction to edit its amount" onClick={() => openEdit(selected, "amount")} className="rounded border bg-white px-3 py-2 disabled:opacity-40">Edit amount</button></div>
      </div>
      {edit && edit.ids.length > 1 && <div className="border-t bg-teal-50 p-3"><OccurrenceEditor edit={edit} busy={busy} onChange={(value) => setEdit({ ...edit, value })} onSave={() => void apply()} onCancel={() => setEdit(null)} /></div>}
      {message && <p role="status" className="px-3 py-2 text-xs">{message}</p>}
    </div>
    <DockWeekInsights week={week} />
  </section>;
}

function OccurrenceEditor({ edit, busy, onChange, onSave, onCancel }: { edit: { mode: "move" | "amount"; value: string }; busy: boolean; onChange: (value: string) => void; onSave: () => void; onCancel: () => void }) {
  return <form onSubmit={(event) => { event.preventDefault(); onSave(); }} className="flex items-end gap-2 text-sm"><label className="grid gap-1"><span>{edit.mode === "move" ? "New occurrence date" : "Occurrence amount"}</span>{edit.mode === "move" ? <input required aria-label="New occurrence date" type="date" value={edit.value} onChange={(event) => onChange(event.target.value)} className="rounded border bg-white px-3 py-2" /> : <FinancialInput required aria-label="Occurrence amount" type="number" min="0.01" step="0.01" value={edit.value} onChange={(event) => onChange(event.target.value)} className="rounded border bg-white px-3 py-2" />}</label><button disabled={busy || !edit.value} className="rounded bg-harbor-teal px-3 py-2 font-semibold text-white disabled:opacity-40">{busy ? "Saving..." : "Save occurrence"}</button><button type="button" disabled={busy} onClick={onCancel} className="rounded border px-3 py-2">Cancel</button><span className="pb-2 text-xs text-slate-500">Only the selected occurrence(s); recurring schedules stay the same.</span></form>;
}

function DockIcon({ kind }: { kind: "calendar" | "edit" | "skip" }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" className="mx-auto">{kind === "calendar" ? <><rect x="4" y="5" width="16" height="16" rx="2" /><path d="M8 3v5m8-5v5M4 11h16m-11 4h3" /></> : kind === "edit" ? <><path d="m4 16 12-12 4 4L8 20H4zM13 7l4 4" /></> : <path d="m5 5 10 7-10 7zm14 0v14" />}</svg>;
}

export function DockWeekInsights({ week }: { week: HarborWeekForecast }) {
  const projected = weekProjection(week);
  const points = [...projected, { date: week.week.end, balance: week.ending }];
  const upper = Math.max(0, ...points.map((point) => point.balance));
  const lower = Math.min(0, ...points.map((point) => point.balance));
  const rawStep = Math.max(1, upper - lower) / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const step = (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude;
  const high = Math.ceil(upper / step) * step || step;
  const low = Math.floor(lower / step) * step;
  const ticks = Array.from({ length: Math.round((high - low) / step) + 1 }, (_, index) => low + index * step);
  const x = (date: Date) => 65 + (date.getTime() - week.week.start.getTime()) / Math.max(1, week.week.end.getTime() - week.week.start.getTime()) * 475;
  const y = (balance: number) => 175 - (balance - low) / (high - low) * 150;
  const path = points.map((point, index) => `${index ? "L" : "M"}${x(point.date)},${y(point.balance)}`).join(" ");
  const minimum = points.reduce((a, b) => b.balance < a.balance ? b : a);
  const groups = new Map<string, { incoming: number; outgoing: number }>();
  week.events.forEach((event) => {
    const key = event.chart || (event.kind === "income" ? "Income" : event.kind === "transfer" ? "Savings" : "Payments");
    const group = groups.get(key) ?? { incoming: 0, outgoing: 0 };
    if (event.kind === "income") group.incoming += event.amount; else group.outgoing += event.amount;
    groups.set(key, group);
  });
  const clipId = useId();
  return <div className="mt-4 grid gap-4 xl:grid-cols-2">
    <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-3"><h3 className="text-sm font-bold">Weekly cash flow</h3><svg viewBox="0 0 590 235" className="mt-2 w-full" role="img" aria-label={`Projected balance starts at ${formatMoney(week.starting)}, lowest ${formatMoney(week.lowest)} on ${formatShortDate(week.lowestDate)}, ends ${formatMoney(week.ending)}`}>
      <defs><clipPath id={clipId}><rect x="65" y={y(0)} width="475" height={Math.max(0, 175 - y(0))} /></clipPath></defs>
      {ticks.map((value) => { return <g key={value}><line x1="65" x2="540" y1={y(value)} y2={y(value)} stroke="#e2e8f0" /><text x="58" y={y(value) + 4} textAnchor="end" fontSize="11" fill="#64748b">{new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(value)}</text></g>; })}
      <path d={`${path} L540,175 L65,175 Z`} fill="#0d9488" fillOpacity=".08" /><path d={path} fill="none" stroke="#0d9488" strokeWidth="2.5" /><path d={path} fill="none" stroke="#dc2626" strokeWidth="3" clipPath={`url(#${clipId})`} />
      <line x1="65" x2="540" y1={y(0)} y2={y(0)} stroke="#94a3b8" strokeDasharray="3 4" />
      {points.map((point, index) => <circle key={index} cx={x(point.date)} cy={y(point.balance)} r="3" fill={point.balance < 0 ? "#dc2626" : "#0d9488"}><title>{formatShortDate(point.date)}: {formatMoney(point.balance)}</title></circle>)}
      {[0,1,2,3,4,5,6].map((day) => { const date = new Date(week.week.start); date.setDate(date.getDate() + day); return <g key={day}><text x={x(date)} y="195" textAnchor="middle" fontSize="11" fill="#64748b">{date.toLocaleDateString("en-US", { weekday: "short" })}</text><text x={x(date)} y="210" textAnchor="middle" fontSize="10" fill="#64748b">{date.getMonth()+1}/{date.getDate()}</text></g>; })}
      <circle cx={x(minimum.date)} cy={y(minimum.balance)} r="5" fill={minimum.balance < 0 ? "#dc2626" : "#0d9488"} />
      <g transform={`translate(${Math.min(475, Math.max(130, x(minimum.date)))},${Math.max(32, y(minimum.balance) - 20)})`}><rect x="-65" y="-14" width="130" height="22" rx="5" fill="white" stroke={minimum.balance < 0 ? "#fecaca" : "#99f6e4"} /><text textAnchor="middle" fontSize="12" fontWeight="bold" fill={minimum.balance < 0 ? "#b91c1c" : "#0f766e"}>Low {formatMoney(minimum.balance)}</text></g>
      <text x="540" y={Math.max(14, y(week.ending) - 12)} textAnchor="end" fontSize="12" fontWeight="bold" fill={week.ending < 0 ? "#b91c1c" : "#0f766e"}>End {formatMoney(week.ending)}</text>
    </svg><p className="text-xs text-slate-500">Lowest {formatMoney(week.lowest)} on {formatShortDate(week.lowestDate)}. Red marks balances below zero.</p></section>
    <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-3"><h3 className="mb-3 text-sm font-bold">Category breakdown <span className="font-normal text-slate-500">(this week)</span></h3><div className="grid grid-cols-2 gap-4">{(["incoming", "outgoing"] as const).map((direction) => <div key={direction}><h4 className={`mb-3 text-xs font-semibold ${direction === "incoming" ? "text-emerald-700" : "text-red-600"}`}>{direction === "incoming" ? "Inflow" : "Outflow"}</h4><div className="space-y-3">{[...groups].filter(([, group]) => group[direction] > 0).map(([name, group]) => <div key={name} className="text-xs"><div className="flex flex-wrap justify-between gap-1"><span>{name}</span><strong className="tabular-nums">{formatMoney(group[direction])}</strong></div><div className="mt-1 h-1 rounded bg-slate-100"><div className={`h-1 rounded ${direction === "incoming" ? "bg-emerald-500" : "bg-red-400"}`} style={{ width: `${group[direction] / Math.max(1, direction === "incoming" ? week.inflows : week.outflows) * 100}%` }} /></div></div>)}{![...groups].some(([, group]) => group[direction] > 0) && <p className="text-xs text-slate-500">None planned</p>}</div><div className="mt-4 flex flex-wrap justify-between gap-1 border-t pt-2 text-xs font-bold"><span>Total {direction === "incoming" ? "in" : "out"}</span><span>{formatMoney(direction === "incoming" ? week.inflows : week.outflows)}</span></div></div>)}</div></section>
  </div>;
}
