"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { EmptyState } from "../components/EmptyState";
import { loadSettingsWithSupabaseFallback, saveSettings } from "../lib/budget-settings";
import { localRepo } from "../lib/local-repo";
import { getRipplePlanType } from "../lib/ripple-type";
import { getDefaultRecurrence, recurrenceFromLegacyFrequency, recurrenceLabel } from "../lib/schedule";
import { cardCycleForDate, formatMoney, formatShortDate } from "../lib/harbor-domain";
import { SEED_DATA } from "../data/seedData";
import type { AppSettings, CreditCardAccount, DayOfMonth, FrequencyType, LineItem, PaymentMethod, Recurrence, RecurrenceType, RecurrenceUnit, RipplePlanType, RippleType } from "../lib/types";

const SHOW_DEV_TOOLS = process.env.NEXT_PUBLIC_SHOW_DEV_TOOLS === "true";
const DEFAULT_CHARTS = ["Home", "Food & Household", "Transportation", "Kids & Family", "Fun", "Subscriptions", "Savings", "Gifts", "Other"];
const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_DAY_OPTIONS: DayOfMonth[] = [...Array.from({ length: 31 }, (_, index) => index + 1), "last"];

type SettingsSection = "ripples" | "waves" | "fleet" | "charts";
type EditingItem = Omit<LineItem, "id"> & { id?: string };

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function todayISODate() {
  const today = new Date();
  return [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0"),
  ].join("-");
}

function currentMonthValue() {
  return todayISODate().slice(0, 7);
}

function monthDateFromValue(value: string) {
  return value ? `${value}-01` : undefined;
}

function monthValueFromDate(value?: string) {
  return value?.slice(0, 7) ?? currentMonthValue();
}

function dayOfMonthValue(day: DayOfMonth | undefined) {
  return day === undefined ? "1" : String(day);
}

function parseDayOfMonth(value: string): DayOfMonth {
  return value === "last" ? "last" : Number(value);
}

function frequencyForRecurrence(recurrence?: Recurrence): FrequencyType {
  switch (recurrence?.type) {
    case "biweekly":
      return "every-other-week";
    case "twiceMonthly":
      return "twice-a-month";
    case "monthly":
      return "once-a-month-1";
    default:
      return "every-week";
  }
}

function clampDay(value: string, fallback: number) {
  return Math.min(31, Math.max(1, Number(value) || fallback));
}

function defaultRippleChart(charts: string[]) {
  return charts.find((chart) => chart.toLowerCase() !== "pay") ?? charts[0] ?? "Other";
}

function blankRipple(charts: string[], paymentMethod: PaymentMethod): EditingItem {
  return {
    category: defaultRippleChart(charts),
    name: "",
    defaultAmount: 0,
    paymentMethod,
    isIncome: false,
    frequency: "every-week",
    waveType: "recurring",
    planType: "weekly_allowance",
    rippleType: "flexible",
  };
}

function blankWave(charts: string[]): EditingItem {
  return {
    category: charts[0] ?? "Pay",
    name: "",
    defaultAmount: 0,
    paymentMethod: "checking",
    isIncome: true,
    frequency: "every-week",
    waveType: "recurring",
    recurrence: getDefaultRecurrence(),
  };
}

function normalizeRipple(form: EditingItem): LineItem {
  const planType = form.planType ?? getRipplePlanType(form as LineItem);
  const base = {
    ...(form as LineItem),
    isIncome: false,
    planType,
    rippleType: planType === "scheduled_expense" ? "fixed" as RippleType : "flexible" as RippleType,
  };

  if (planType === "weekly_allowance") {
    return {
      ...base,
      waveType: "recurring",
      oneTimeDate: undefined,
      frequency: "every-week",
      recurrence: undefined,
      anchorDate: undefined,
      anchorMonth: undefined,
    };
  }

  if (planType === "monthly_allowance") {
    const recurring = form.waveType !== "oneTime";
    return {
      ...base,
      waveType: recurring ? "recurring" : "oneTime",
      oneTimeDate: recurring ? undefined : form.oneTimeDate ?? monthDateFromValue(currentMonthValue()),
      frequency: "once-a-month-1",
      recurrence: recurring ? { type: "monthly", daysOfMonth: [1] } : undefined,
      anchorDate: undefined,
      anchorMonth: undefined,
    };
  }

  const recurrence = form.waveType === "oneTime"
    ? undefined
    : form.recurrence ?? recurrenceFromLegacyFrequency({ ...(form as LineItem), id: form.id ?? "" });

  return {
    ...base,
    waveType: form.waveType ?? "recurring",
    oneTimeDate: form.waveType === "oneTime" ? form.oneTimeDate : undefined,
    recurrence,
    frequency: form.waveType === "oneTime" ? "once-a-month-1" : frequencyForRecurrence(recurrence),
    anchorDate: recurrence?.startDate,
  };
}

function normalizeWave(form: EditingItem): LineItem {
  const recurrence = form.waveType === "oneTime"
    ? undefined
    : form.recurrence ?? recurrenceFromLegacyFrequency({ ...(form as LineItem), id: form.id ?? "" });
  return {
    ...(form as LineItem),
    isIncome: true,
    paymentMethod: "checking",
    planType: undefined,
    rippleType: undefined,
    waveType: form.waveType ?? "recurring",
    oneTimeDate: form.waveType === "oneTime" ? form.oneTimeDate : undefined,
    recurrence,
    frequency: form.waveType === "oneTime" ? "once-a-month-1" : frequencyForRecurrence(recurrence),
    anchorDate: recurrence?.startDate,
  };
}

function planLabel(item: LineItem) {
  const planType = getRipplePlanType(item);
  if (planType === "weekly_allowance") return "Weekly Allowance";
  if (planType === "monthly_allowance") return "Monthly Allowance";
  return "Scheduled Expense";
}

function rippleImpact(item: LineItem, cardLabel?: string) {
  const planType = getRipplePlanType(item);
  if (planType !== "scheduled_expense") {
    return item.paymentMethod === "checking" ? "Budget; cash moves only when spending is logged" : `Budget + future ${cardLabel ?? "card"} payment`;
  }
  return item.paymentMethod === "checking" ? "Budget + Cash Flow" : `Budget + future ${cardLabel ?? "card"} payment`;
}

function rippleSummary(item: LineItem, cards: CreditCardAccount[]) {
  const card = cards.find((candidate) => candidate.id === item.paymentMethod);
  const planType = getRipplePlanType(item);
  if (planType === "weekly_allowance") return `$${item.defaultAmount.toLocaleString()} / week · ${item.category} · ${card?.label ?? "Checking"}`;
  if (planType === "monthly_allowance") {
    const timing = item.waveType === "oneTime" ? monthValueFromDate(item.oneTimeDate) : "monthly";
    return `$${item.defaultAmount.toLocaleString()} · ${timing} · ${item.category} · ${card?.label ?? "Checking"}`;
  }
  return `$${item.defaultAmount.toLocaleString()} · ${item.waveType === "oneTime" ? item.oneTimeDate ?? "one-time" : recurrenceLabel(item.recurrence ?? recurrenceFromLegacyFrequency(item))} · ${card?.label ?? "Checking"}`;
}

export default function Settings() {
  const router = useRouter();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [activeSection, setActiveSection] = useState<SettingsSection>("ripples");
  const [saved, setSaved] = useState(false);
  const [rippleForm, setRippleForm] = useState<EditingItem | null>(null);
  const [waveForm, setWaveForm] = useState<EditingItem | null>(null);
  const [cardBalanceDrafts, setCardBalanceDrafts] = useState<Record<string, string>>({});
  const [newChart, setNewChart] = useState("");
  const [newCard, setNewCard] = useState({ label: "", closeDay: "21", dueDay: "15" });

  useEffect(() => {
    let cancelled = false;
    async function loadInitialData() {
      const loadedSettings = await loadSettingsWithSupabaseFallback();
      if (cancelled) return;
      if (!loadedSettings) {
        router.push("/setup");
        return;
      }
      setSettings(loadedSettings);
      setCardBalanceDrafts(Object.fromEntries(loadedSettings.creditCards.map((card) => [card.id, String(card.currentBalance ?? 0)])));
      const hash = window.location.hash.replace("#", "");
      if (["ripples", "waves", "fleet", "charts"].includes(hash)) setActiveSection(hash as SettingsSection);
    }
    void loadInitialData();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function persist(updated: AppSettings) {
    setSettings(updated);
    const savedSettings = await saveSettings(updated);
    setSettings(savedSettings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function loadDemoData() {
    if (!confirm("This will replace all current settings with demo data. Continue?")) return;
    localRepo.saveAmounts({});
    localRepo.saveMonthBalances({});
    await persist(SEED_DATA);
  }

  async function saveRipple(form: EditingItem) {
    if (!settings || !form.name.trim() || form.defaultAmount <= 0) return;
    const savedItem = normalizeRipple(form);
    const nextItems = form.id
      ? settings.lineItems.map((item) => item.id === form.id ? savedItem : item)
      : [...settings.lineItems, { ...savedItem, id: uid() }];
    await persist({ ...settings, lineItems: nextItems });
    setRippleForm(null);
  }

  async function saveWave(form: EditingItem) {
    if (!settings || !form.name.trim() || form.defaultAmount <= 0) return;
    if (form.waveType === "oneTime" && !form.oneTimeDate) return;
    const savedItem = normalizeWave(form);
    const nextItems = form.id
      ? settings.lineItems.map((item) => item.id === form.id ? savedItem : item)
      : [...settings.lineItems, { ...savedItem, id: uid() }];
    await persist({ ...settings, lineItems: nextItems });
    setWaveForm(null);
  }

  function deleteItem(id: string) {
    if (!settings || !confirm("Delete this item?")) return;
    void persist({ ...settings, lineItems: settings.lineItems.filter((item) => item.id !== id) });
  }

  function addChart() {
    const name = newChart.trim();
    if (!settings || !name || settings.categories.includes(name)) return;
    void persist({ ...settings, categories: [...settings.categories, name] });
    setNewChart("");
  }

  function removeChart(chart: string) {
    if (!settings) return;
    const hasItems = settings.lineItems.some((item) => item.category === chart);
    if (hasItems && !confirm(`"${chart}" contains Ripples or Waves. Delete the Chart and those definitions?`)) return;
    void persist({
      ...settings,
      categories: settings.categories.filter((item) => item !== chart),
      lineItems: settings.lineItems.filter((item) => item.category !== chart),
    });
  }

  function moveChart(chart: string, delta: number) {
    if (!settings) return;
    const index = settings.categories.indexOf(chart);
    const nextIndex = index + delta;
    if (index < 0 || nextIndex < 0 || nextIndex >= settings.categories.length) return;
    const next = [...settings.categories];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    void persist({ ...settings, categories: next });
  }

  function addCard() {
    if (!settings || !newCard.label.trim()) return;
    const card = {
      id: `credit-${crypto.randomUUID()}` as PaymentMethod,
      label: newCard.label.trim(),
      currentBalance: 0,
      currentBalanceUpdatedAt: new Date().toISOString(),
      statementClosingDay: clampDay(newCard.closeDay, 21),
      paymentDueDay: clampDay(newCard.dueDay, 15),
    };
    void persist({ ...settings, creditCards: [...settings.creditCards, card] });
    setCardBalanceDrafts((current) => ({ ...current, [card.id]: "0" }));
    setNewCard({ label: "", closeDay: "21", dueDay: "15" });
  }

  function updateCard(id: PaymentMethod, updater: (card: CreditCardAccount) => CreditCardAccount) {
    if (!settings) return;
    void persist({ ...settings, creditCards: settings.creditCards.map((card) => card.id === id ? updater(card) : card) });
  }

  function removeCard(id: PaymentMethod) {
    if (!settings) return;
    const card = settings.creditCards.find((candidate) => candidate.id === id);
    if (!card) return;
    if (!confirm(`Remove ${card.label}? Ripples using it will switch to Checking.`)) return;
    void persist({
      ...settings,
      creditCards: settings.creditCards.filter((candidate) => candidate.id !== id),
      lineItems: settings.lineItems.map((item) => item.paymentMethod === id ? { ...item, paymentMethod: "checking" as PaymentMethod } : item),
    });
  }

  function updateCardBalance(id: PaymentMethod) {
    if (!settings) return;
    const value = cardBalanceDrafts[id] ?? "";
    const amount = value.trim() === "" ? 0 : Number(value);
    if (!Number.isFinite(amount) || amount < 0) return;
    void persist({
      ...settings,
      creditCards: settings.creditCards.map((card) => card.id === id ? {
        ...card,
        currentBalance: amount,
        currentBalanceUpdatedAt: new Date().toISOString(),
      } : card),
    });
  }

  if (!settings) {
    return (
      <main className="flex flex-1 items-center justify-center bg-harbor-offwhite">
        <p className="text-harbor-navy/50">Loading...</p>
      </main>
    );
  }

  const ripples = settings.lineItems.filter((item) => !item.isIncome);
  const waves = settings.lineItems.filter((item) => item.isIncome);
  const paymentOptions = [
    { value: "checking" as PaymentMethod, label: "Checking" },
    ...settings.creditCards.map((card) => ({ value: card.id, label: card.label })),
  ];
  const unusedDefaults = DEFAULT_CHARTS.filter((chart) => !settings.categories.includes(chart));

  return (
    <main className="flex-1 bg-harbor-offwhite p-4 text-harbor-navy">
      <div className="mx-auto max-w-[1280px] space-y-5">
        <section className="flex flex-col gap-4 border-b border-harbor-teal-light py-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-harbor-teal">Settings</p>
            <h1 className="mt-1 text-3xl font-bold">Chart Room</h1>
            <p className="mt-1 text-sm text-harbor-navy/55">Tell Harbor how your money behaves.</p>
          </div>
          <div className="flex items-center gap-2">
            {saved && <span className="rounded-full bg-harbor-green/10 px-3 py-1 text-xs font-semibold text-harbor-green">Saved</span>}
            {SHOW_DEV_TOOLS && (
              <button type="button" onClick={() => void loadDemoData()} className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs font-semibold text-slate-500 hover:border-harbor-teal hover:text-harbor-teal">Load Demo</button>
            )}
          </div>
        </section>

        <nav className="flex flex-wrap gap-2">
          {([
            ["ripples", "Ripples", ripples.length],
            ["waves", "Waves", waves.length],
            ["fleet", "Fleet", settings.creditCards.length],
            ["charts", "Charts", settings.categories.length],
          ] as const).map(([id, label, count]) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveSection(id)}
              className={`rounded-lg border px-4 py-2 text-sm font-semibold ${activeSection === id ? "border-harbor-teal bg-harbor-teal text-white" : "border-slate-200 bg-white text-harbor-navy/65 hover:border-harbor-teal-light"}`}
            >
              {label} <span className="ml-1 opacity-70">{count}</span>
            </button>
          ))}
        </nav>

        {activeSection === "ripples" && (
          <Section
            title="Ripples"
            subtitle="Spending plans: allowances and scheduled expenses."
            action={!rippleForm && <button type="button" onClick={() => setRippleForm(blankRipple(settings.categories, settings.creditCards[0]?.id ?? "checking"))} className="rounded-lg bg-harbor-red px-4 py-2 text-sm font-semibold text-white">Add Ripple</button>}
          >
            <div className="space-y-2">
              {ripples.length === 0 && !rippleForm && <EmptyState title="No Ripples yet">Add spending plans for allowances, bills, subscriptions, and one-time budgets.</EmptyState>}
              {ripples.map((item) => {
                const card = settings.creditCards.find((candidate) => candidate.id === item.paymentMethod);
                return (
                  <DefinitionRow
                    key={item.id}
                    title={item.name}
                    badge={planLabel(item)}
                    summary={rippleSummary(item, settings.creditCards)}
                    impact={rippleImpact(item, card?.label)}
                    onEdit={() => setRippleForm({ ...item, planType: getRipplePlanType(item) })}
                    onDelete={() => deleteItem(item.id)}
                  />
                );
              })}
            </div>
            {rippleForm && (
              <RippleForm
                item={rippleForm}
                charts={settings.categories}
                paymentOptions={paymentOptions}
                onSave={saveRipple}
                onCancel={() => setRippleForm(null)}
              />
            )}
          </Section>
        )}

        {activeSection === "waves" && (
          <Section
            title="Waves"
            subtitle="Income expected to arrive in checking."
            action={!waveForm && <button type="button" onClick={() => setWaveForm(blankWave(settings.categories))} className="rounded-lg bg-harbor-green px-4 py-2 text-sm font-semibold text-white">Add Wave</button>}
          >
            <div className="space-y-2">
              {waves.length === 0 && !waveForm && <EmptyState title="No Waves yet">Add recurring income or one-time deposits so Dock can forecast cash in.</EmptyState>}
              {waves.map((item) => (
                <DefinitionRow
                  key={item.id}
                  title={item.name}
                  badge={item.waveType === "oneTime" ? "One-Time Income" : "Recurring Income"}
                  summary={`$${item.defaultAmount.toLocaleString()} · ${item.waveType === "oneTime" ? item.oneTimeDate ?? "No date" : recurrenceLabel(item.recurrence ?? recurrenceFromLegacyFrequency(item))} · Checking`}
                  impact="Dock cash-in"
                  onEdit={() => setWaveForm({ ...item })}
                  onDelete={() => deleteItem(item.id)}
                />
              ))}
            </div>
            {waveForm && (
              <WaveForm
                item={waveForm}
                onSave={saveWave}
                onCancel={() => setWaveForm(null)}
              />
            )}
          </Section>
        )}

        {activeSection === "fleet" && (
          <Section title="Fleet" subtitle="Credit cards that turn card spending into future checking obligations.">
            <div className="space-y-2">
              {settings.creditCards.length === 0 && <EmptyState title="No Fleet cards yet">Add cards used for spending so Harbor can route future payments.</EmptyState>}
              {settings.creditCards.map((card) => (
                <div key={card.id} className="rounded-lg border border-slate-100 bg-harbor-offwhite px-4 py-3">
                  <div className="flex flex-col gap-4">
                    <div>
                      <div className="font-bold">{card.label}</div>
                      <div className="text-xs text-harbor-navy/50">Closes day {card.statementClosingDay ?? 31} · Due day {card.paymentDueDay ?? 15} · Paid from Checking</div>
                    </div>
                    <FleetBalanceSummary card={card} />
                    <div className="flex flex-wrap items-end gap-2">
                      <label className="grid gap-1">
                        <span className="text-xs text-harbor-navy/45">Current Balance</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={cardBalanceDrafts[card.id] ?? String(card.currentBalance ?? 0)}
                          onChange={(event) => setCardBalanceDrafts((current) => ({ ...current, [card.id]: event.target.value }))}
                          className="w-36 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                        />
                      </label>
                      <button type="button" onClick={() => updateCardBalance(card.id)} className="rounded-lg bg-harbor-teal px-3 py-2 text-xs font-semibold text-white">Update Balance</button>
                      <label className="grid gap-1">
                        <span className="text-xs text-harbor-navy/45">Close Day</span>
                        <input type="number" min="1" max="31" value={card.statementClosingDay ?? 31} onChange={(event) => updateCard(card.id, (current) => ({ ...current, statementClosingDay: clampDay(event.target.value, 31) }))} className="w-24 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
                      </label>
                      <label className="grid gap-1">
                        <span className="text-xs text-harbor-navy/45">Due Day</span>
                        <input type="number" min="1" max="31" value={card.paymentDueDay ?? 15} onChange={(event) => updateCard(card.id, (current) => ({ ...current, paymentDueDay: clampDay(event.target.value, 15) }))} className="w-24 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
                      </label>
                      <button type="button" onClick={() => removeCard(card.id)} className="rounded-lg border border-harbor-red/20 px-3 py-2 text-xs font-semibold text-harbor-red">Remove</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 grid gap-2 md:grid-cols-[1fr_120px_120px_auto]">
              <input className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" placeholder="Card name" value={newCard.label} onChange={(event) => setNewCard((current) => ({ ...current, label: event.target.value }))} />
              <input className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" type="number" min="1" max="31" aria-label="Statement close day" value={newCard.closeDay} onChange={(event) => setNewCard((current) => ({ ...current, closeDay: event.target.value }))} />
              <input className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" type="number" min="1" max="31" aria-label="Due day" value={newCard.dueDay} onChange={(event) => setNewCard((current) => ({ ...current, dueDay: event.target.value }))} />
              <button type="button" onClick={addCard} className="rounded-lg bg-harbor-navy px-4 py-2 text-sm font-semibold text-white">Add Card</button>
            </div>
          </Section>
        )}

        {activeSection === "charts" && (
          <Section title="Charts" subtitle="Budget organization. Charts do not control cash timing.">
            <div className="space-y-2">
              {settings.categories.map((chart, index) => (
                <div key={chart} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-100 bg-harbor-offwhite px-4 py-3">
                  <div>
                    <div className="font-bold">{chart}</div>
                    <div className="text-xs text-harbor-navy/50">{settings.lineItems.filter((item) => item.category === chart).length} definitions</div>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => moveChart(chart, -1)} disabled={index === 0} className="rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-harbor-navy/55 disabled:opacity-35">Up</button>
                    <button type="button" onClick={() => moveChart(chart, 1)} disabled={index === settings.categories.length - 1} className="rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-harbor-navy/55 disabled:opacity-35">Down</button>
                    <button type="button" onClick={() => removeChart(chart)} className="rounded-md border border-harbor-red/20 px-2 py-1 text-xs font-semibold text-harbor-red">Remove</button>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex gap-2">
              <input className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" placeholder="New Chart name" value={newChart} onChange={(event) => setNewChart(event.target.value)} onKeyDown={(event) => event.key === "Enter" && addChart()} />
              <button type="button" onClick={addChart} className="rounded-lg bg-harbor-teal px-4 py-2 text-sm font-semibold text-white">Add Chart</button>
            </div>
            {unusedDefaults.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {unusedDefaults.map((chart) => (
                  <button key={chart} type="button" onClick={() => void persist({ ...settings, categories: [...settings.categories, chart] })} className="rounded-full border border-dashed border-slate-300 px-3 py-1.5 text-xs font-semibold text-harbor-navy/55 hover:border-harbor-teal hover:text-harbor-teal">+ {chart}</button>
                ))}
              </div>
            )}
          </Section>
        )}
      </div>
    </main>
  );
}

function Section({ title, subtitle, action, children }: { title: string; subtitle: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-harbor-teal-light bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">{title}</h2>
          <p className="mt-1 text-sm text-harbor-navy/55">{subtitle}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function DefinitionRow({ title, badge, summary, impact, onEdit, onDelete }: { title: string; badge: string; summary: string; impact: string; onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-slate-100 bg-harbor-offwhite px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <div className="font-bold">{title}</div>
          <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-harbor-teal">{badge}</span>
        </div>
        <div className="mt-1 text-sm text-harbor-navy/55">{summary}</div>
        <div className="mt-1 text-xs font-semibold text-harbor-navy/45">{impact}</div>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={onEdit} className="rounded-lg bg-harbor-teal/10 px-3 py-2 text-xs font-semibold text-harbor-teal">Edit</button>
        <button type="button" onClick={onDelete} className="rounded-lg bg-harbor-red/10 px-3 py-2 text-xs font-semibold text-harbor-red">Delete</button>
      </div>
    </div>
  );
}

function FleetBalanceSummary({ card }: { card: CreditCardAccount }) {
  const updatedAt = card.currentBalanceUpdatedAt ? new Date(card.currentBalanceUpdatedAt) : null;
  const anchorDate = updatedAt && !Number.isNaN(updatedAt.getTime()) ? updatedAt : new Date();
  const cycle = cardCycleForDate(card, anchorDate);

  return (
    <div className="grid gap-3 rounded-lg border border-white bg-white/70 p-3 md:grid-cols-2">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-harbor-navy/45">Current Balance</div>
        <div className="mt-1 text-xl font-bold text-harbor-navy">{formatMoney(card.currentBalance ?? 0)}</div>
        <div className="text-xs text-harbor-navy/50">{updatedAt ? `Updated ${formatShortDate(updatedAt)}` : "Not updated yet"}</div>
      </div>
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-harbor-navy/45">Current Cycle</div>
        <div className="mt-1 text-sm font-bold text-harbor-navy">{formatShortDate(cycle.cycleStart)} - {formatShortDate(cycle.cycleEnd)}</div>
        <div className="text-xs text-harbor-navy/50">Projected due {formatShortDate(cycle.dueDate)}</div>
      </div>
    </div>
  );
}

function RippleForm({ item, charts, paymentOptions, onSave, onCancel }: { item: EditingItem; charts: string[]; paymentOptions: { value: PaymentMethod; label: string }[]; onSave: (item: EditingItem) => void | Promise<void>; onCancel: () => void }) {
  const [form, setForm] = useState<EditingItem>({ ...item, planType: item.planType ?? getRipplePlanType(item as LineItem) });
  const planType = form.planType ?? "weekly_allowance";
  const recurrence = form.recurrence ?? getDefaultRecurrence();

  function setPlanType(nextPlanType: RipplePlanType) {
    setForm((current) => ({
      ...current,
      planType: nextPlanType,
      rippleType: nextPlanType === "scheduled_expense" ? "fixed" : "flexible",
      waveType: nextPlanType === "monthly_allowance" ? current.waveType ?? "recurring" : "recurring",
      recurrence: nextPlanType === "scheduled_expense" ? current.recurrence ?? getDefaultRecurrence() : undefined,
      oneTimeDate: nextPlanType === "monthly_allowance" && current.waveType === "oneTime" ? current.oneTimeDate ?? monthDateFromValue(currentMonthValue()) : undefined,
    }));
  }

  return (
    <div className="mt-4 rounded-lg border border-harbor-teal-light bg-harbor-offwhite p-4">
      <h3 className="font-bold">{form.id ? "Edit Ripple" : "New Ripple"}</h3>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <Field label="Name"><input autoFocus className="field" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Groceries" /></Field>
        <Field label="Amount"><MoneyInput value={form.defaultAmount} onChange={(value) => setForm((current) => ({ ...current, defaultAmount: value }))} /></Field>
        <Field label="Plan Type">
          <select className="field" value={planType} onChange={(event) => setPlanType(event.target.value as RipplePlanType)}>
            <option value="weekly_allowance">Weekly Allowance</option>
            <option value="monthly_allowance">Monthly Allowance</option>
            <option value="scheduled_expense">Scheduled Expense</option>
          </select>
        </Field>
        <Field label="Chart">
          <select className="field" value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}>
            {charts.map((chart) => <option key={chart} value={chart}>{chart}</option>)}
          </select>
        </Field>
        <Field label={planType === "scheduled_expense" ? "Payment Method" : "Default Payment"}>
          <select className="field" value={form.paymentMethod} onChange={(event) => setForm((current) => ({ ...current, paymentMethod: event.target.value as PaymentMethod }))}>
            {paymentOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </Field>
        {planType === "monthly_allowance" && (
          <>
            <Field label="Month Behavior">
              <select className="field" value={form.waveType === "oneTime" ? "oneTime" : "recurring"} onChange={(event) => setForm((current) => ({ ...current, waveType: event.target.value as "recurring" | "oneTime", oneTimeDate: event.target.value === "oneTime" ? current.oneTimeDate ?? monthDateFromValue(currentMonthValue()) : undefined }))}>
                <option value="recurring">Every month</option>
                <option value="oneTime">One selected month</option>
              </select>
            </Field>
            {form.waveType === "oneTime" && <Field label="Budget Month"><input className="field" type="month" value={monthValueFromDate(form.oneTimeDate)} onChange={(event) => setForm((current) => ({ ...current, oneTimeDate: monthDateFromValue(event.target.value) }))} /></Field>}
          </>
        )}
        {planType === "scheduled_expense" && (
          <ScheduleFields form={form} recurrence={recurrence} onChange={setForm} />
        )}
      </div>
      <PlanHint planType={planType} paymentMethod={form.paymentMethod} />
      <FormActions onSave={() => void onSave(form)} onCancel={onCancel} />
    </div>
  );
}

function WaveForm({ item, onSave, onCancel }: { item: EditingItem; onSave: (item: EditingItem) => void | Promise<void>; onCancel: () => void }) {
  const [form, setForm] = useState<EditingItem>(item);
  const recurrence = form.recurrence ?? getDefaultRecurrence();
  return (
    <div className="mt-4 rounded-lg border border-harbor-teal-light bg-harbor-offwhite p-4">
      <h3 className="font-bold">{form.id ? "Edit Wave" : "New Wave"}</h3>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <Field label="Name"><input autoFocus className="field" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Main Pay" /></Field>
        <Field label="Amount"><MoneyInput value={form.defaultAmount} onChange={(value) => setForm((current) => ({ ...current, defaultAmount: value }))} /></Field>
        <Field label="Wave Type">
          <select className="field" value={form.waveType ?? "recurring"} onChange={(event) => setForm((current) => ({ ...current, waveType: event.target.value as "recurring" | "oneTime", oneTimeDate: event.target.value === "oneTime" ? current.oneTimeDate ?? todayISODate() : undefined, recurrence: event.target.value === "recurring" ? current.recurrence ?? getDefaultRecurrence() : undefined }))}>
            <option value="recurring">Recurring Income</option>
            <option value="oneTime">One-Time Income</option>
          </select>
        </Field>
        <Field label="Destination"><input className="field" value="Checking" disabled /></Field>
        {form.waveType === "oneTime" ? (
          <Field label="Date"><input className="field" type="date" value={form.oneTimeDate ?? todayISODate()} onChange={(event) => setForm((current) => ({ ...current, oneTimeDate: event.target.value }))} /></Field>
        ) : (
          <ScheduleFields form={form} recurrence={recurrence} onChange={setForm} income />
        )}
      </div>
      <p className="mt-3 text-xs text-harbor-navy/55">Dock cash-in. Waves define expected deposits, not Budget spending.</p>
      <FormActions onSave={() => void onSave(form)} onCancel={onCancel} />
    </div>
  );
}

function ScheduleFields({ form, recurrence, onChange, income }: { form: EditingItem; recurrence: Recurrence; onChange: React.Dispatch<React.SetStateAction<EditingItem>>; income?: boolean }) {
  function setRecurrence(next: Recurrence) {
    onChange((current) => ({ ...current, recurrence: next, frequency: frequencyForRecurrence(next), anchorDate: next.startDate }));
  }

  function setRecurrenceType(nextType: RecurrenceType) {
    const startDate = recurrence.startDate ?? todayISODate();
    const defaults: Record<RecurrenceType, Recurrence> = {
      weekly: { type: "weekly", daysOfWeek: recurrence.daysOfWeek ?? [5] },
      biweekly: { type: "biweekly", daysOfWeek: recurrence.daysOfWeek ?? [5], startDate },
      twiceMonthly: { type: "twiceMonthly", daysOfMonth: recurrence.daysOfMonth?.slice(0, 2) ?? [1, 15] },
      monthly: { type: "monthly", daysOfMonth: [recurrence.daysOfMonth?.[0] ?? 1] },
      custom: { type: "custom", interval: recurrence.interval ?? 1, unit: recurrence.unit ?? "weeks", startDate },
    };
    setRecurrence(defaults[nextType]);
  }

  if (form.waveType === "oneTime") {
    return <Field label="Date"><input className="field" type="date" value={form.oneTimeDate ?? todayISODate()} onChange={(event) => onChange((current) => ({ ...current, oneTimeDate: event.target.value }))} /></Field>;
  }

  return (
    <>
      <Field label={income ? "Income Schedule" : "Schedule"}>
        <select className="field" value={recurrence.type} onChange={(event) => setRecurrenceType(event.target.value as RecurrenceType)}>
          <option value="weekly">Weekly</option>
          <option value="biweekly">Every two weeks</option>
          <option value="twiceMonthly">Twice monthly</option>
          <option value="monthly">Monthly</option>
          <option value="custom">Custom</option>
        </select>
      </Field>
      {(recurrence.type === "weekly" || recurrence.type === "biweekly") && (
        <Field label="Day of Week">
          <select className="field" value={recurrence.daysOfWeek?.[0] ?? 5} onChange={(event) => setRecurrence({ ...recurrence, daysOfWeek: [Number(event.target.value)] })}>
            {DAY_LABELS.map((label, index) => <option key={label} value={index}>{label}</option>)}
          </select>
        </Field>
      )}
      {recurrence.type === "biweekly" && <Field label="Starting Date"><input className="field" type="date" value={recurrence.startDate ?? todayISODate()} onChange={(event) => setRecurrence({ ...recurrence, startDate: event.target.value })} /></Field>}
      {recurrence.type === "twiceMonthly" && (
        <>
          <Field label="First Date"><MonthDaySelect value={recurrence.daysOfMonth?.[0]} onChange={(day) => setRecurrence({ ...recurrence, daysOfMonth: [day, recurrence.daysOfMonth?.[1] ?? 15] })} /></Field>
          <Field label="Second Date"><MonthDaySelect value={recurrence.daysOfMonth?.[1] ?? 15} onChange={(day) => setRecurrence({ ...recurrence, daysOfMonth: [recurrence.daysOfMonth?.[0] ?? 1, day] })} /></Field>
        </>
      )}
      {recurrence.type === "monthly" && <Field label="Date of Month"><MonthDaySelect value={recurrence.daysOfMonth?.[0]} onChange={(day) => setRecurrence({ ...recurrence, daysOfMonth: [day] })} /></Field>}
      {recurrence.type === "custom" && (
        <>
          <Field label="Every"><input className="field" type="number" min="1" value={recurrence.interval ?? 1} onChange={(event) => setRecurrence({ ...recurrence, interval: Math.max(1, Number(event.target.value) || 1) })} /></Field>
          <Field label="Unit">
            <select className="field" value={recurrence.unit ?? "weeks"} onChange={(event) => setRecurrence({ ...recurrence, unit: event.target.value as RecurrenceUnit })}>
              <option value="days">Days</option>
              <option value="weeks">Weeks</option>
              <option value="months">Months</option>
            </select>
          </Field>
        </>
      )}
    </>
  );
}

function MonthDaySelect({ value, onChange }: { value: DayOfMonth | undefined; onChange: (day: DayOfMonth) => void }) {
  return (
    <select className="field" value={dayOfMonthValue(value)} onChange={(event) => onChange(parseDayOfMonth(event.target.value))}>
      {MONTH_DAY_OPTIONS.map((day) => <option key={day} value={day}>{day === "last" ? "Last day" : day}</option>)}
    </select>
  );
}

function MoneyInput({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-harbor-navy/35">$</span>
      <input className="field pl-7" type="number" min="0" step="0.01" value={value || ""} onChange={(event) => onChange(Number(event.target.value))} />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1">
      <span className="text-xs font-semibold uppercase tracking-wide text-harbor-navy/45">{label}</span>
      {children}
    </label>
  );
}

function PlanHint({ planType, paymentMethod }: { planType: RipplePlanType; paymentMethod: PaymentMethod }) {
  const text = planType === "weekly_allowance"
    ? "An amount available throughout each calendar week. No automatic Dock event is created."
    : planType === "monthly_allowance"
      ? "An amount available throughout the month. Purchases consume it as they happen."
      : paymentMethod === "checking"
        ? "Planned in Budget and included in Dock when scheduled."
        : "Planned in Budget and routed into a future Fleet payment.";
  return <p className="mt-3 text-xs text-harbor-navy/55">{text}</p>;
}

function FormActions({ onSave, onCancel }: { onSave: () => void; onCancel: () => void }) {
  return (
    <div className="mt-4 flex gap-2">
      <button type="button" onClick={onSave} className="rounded-lg bg-harbor-teal px-4 py-2 text-sm font-semibold text-white">Save</button>
      <button type="button" onClick={onCancel} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-harbor-navy/60">Cancel</button>
    </div>
  );
}
