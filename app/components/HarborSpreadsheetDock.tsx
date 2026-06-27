"use client";

import { useMemo, useRef, useState } from "react";
import type { useHarborMonth } from "../lib/use-harbor-month";
import type { BudgetItem, CreditCardPayment, PaymentAccountType } from "../lib/types";

type HarborMonth = ReturnType<typeof useHarborMonth>;
type ViewMode = "budget" | "cash";

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function isoDate(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function isWithinWeek(date: string, week: { start: Date; end: Date }) {
  const normalized = date.slice(0, 10);
  return normalized >= isoDate(week.start) && normalized <= isoDate(week.end);
}

function plannedDateForItem(item: BudgetItem, fallbackDate: string) {
  const config = item.recurrenceConfig && typeof item.recurrenceConfig === "object"
    ? item.recurrenceConfig as Record<string, unknown>
    : {};
  const exact = [config.date, config.scheduledDate, config.dueDate, config.oneTimeDate]
    .find((value): value is string => typeof value === "string");
  if (exact) return exact.slice(0, 10);
  const days = Array.isArray(config.daysOfMonth) ? config.daysOfMonth : undefined;
  const day = days?.find((value): value is number => typeof value === "number")
    ?? (typeof config.dayOfMonth === "number" ? config.dayOfMonth : undefined);
  if (!day) return fallbackDate;
  const [year, month] = fallbackDate.split("-").map(Number);
  return `${year}-${String(month).padStart(2, "0")}-${String(Math.max(1, Math.min(31, day))).padStart(2, "0")}`;
}

function paymentMethodLabel(method: PaymentAccountType) {
  if (method === "credit_card") return "Card";
  if (method === "cash") return "Cash";
  return "Checking";
}

export function HarborSpreadsheetDock({ harbor }: { harbor: HarborMonth }) {
  const [viewMode, setViewMode] = useState<ViewMode>("budget");
  const [balanceDraft, setBalanceDraft] = useState(String(harbor.currentAnchor));
  const [spendDraft, setSpendDraft] = useState({ itemId: "", amount: "", accountId: "", date: isoDate(new Date()) });
  const [paymentDraft, setPaymentDraft] = useState({ cardId: "", amount: "", date: isoDate(new Date()) });
  const incomeHandledRef = useRef(new Set<string>());
  const [incomeHandledIds, setIncomeHandledIds] = useState<Set<string>>(new Set());

  const creditCards = harbor.paymentAccounts.filter((account) => account.type === "credit_card");
  const cashAccounts = harbor.paymentAccounts.filter((account) => account.type === "checking" || account.type === "cash");
  const incomeIds = useMemo(() => new Set(
    harbor.settings?.lineItems.filter((item) => item.isIncome).map((item) => item.id) ?? [],
  ), [harbor.settings]);
  const incomeNames = useMemo(() => new Set(
    harbor.settings?.lineItems.filter((item) => item.isIncome).map((item) => item.name) ?? [],
  ), [harbor.settings]);
  const plannedRows = useMemo(() => (
    harbor.budgetItems.filter((item) => (
      item.active
      && item.amount > 0
      && !incomeIds.has(item.legacyLineItemId ?? "")
      && !incomeNames.has(item.name)
      && item.categoryName !== "Income"
      && item.categoryId !== "Income"
    ))
  ), [harbor.budgetItems, incomeIds, incomeNames]);

  const incomeRows = useMemo(() => (
    harbor.settings?.lineItems.filter((item) => item.isIncome).map((item) => ({
      id: item.id,
      name: item.name,
      categoryName: "Income",
    })) ?? []
  ), [harbor.settings]);

  const firstSpendItem = plannedRows[0];
  const defaultCard = creditCards[0];

  async function saveBalance() {
    const parsed = balanceDraft.trim() === "" ? null : Number(balanceDraft);
    if (parsed !== null && !Number.isFinite(parsed)) return;
    await harbor.saveCheckingBalance(parsed);
  }

  async function logSpending(itemId = spendDraft.itemId, amountText = spendDraft.amount, accountId = spendDraft.accountId, date = spendDraft.date) {
    const item = plannedRows.find((row) => row.id === itemId) ?? firstSpendItem;
    const amount = Number(amountText);
    if (!item || !Number.isFinite(amount) || amount <= 0) return;
    const account = harbor.paymentAccounts.find((candidate) => candidate.id === accountId)
      ?? harbor.paymentAccounts.find((candidate) => candidate.id === item.defaultPaymentAccountId)
      ?? (item.paymentMethod === "credit_card" ? defaultCard : cashAccounts[0]);
    const paymentMethod = account?.type === "credit_card" ? "credit_card" : account?.type === "cash" ? "cash" : "checking";

    await harbor.saveActualTransaction({
      id: crypto.randomUUID(),
      date: date || isoDate(new Date()),
      merchant: item.name,
      amount,
      categoryId: item.categoryId,
      categoryName: item.categoryName,
      accountId: account?.id ?? paymentMethod,
      paymentMethod,
      source: "manual",
      plannedItemId: item.id,
    });
    setSpendDraft((draft) => ({ ...draft, amount: "", itemId: item.id, accountId: account?.id ?? "" }));
  }

  async function markPaid(item: BudgetItem, weekIndex: number, amount: number) {
    if (amount <= 0) return;
    const date = isoDate(harbor.weeks[weekIndex].start);
    const account = item.paymentMethod === "credit_card" ? defaultCard : cashAccounts[0];
    await logSpending(item.id, String(amount), account?.id ?? "", date);
  }

  async function schedulePayment() {
    const card = creditCards.find((account) => account.id === paymentDraft.cardId) ?? defaultCard;
    const cashAccount = cashAccounts[0];
    const amount = Number(paymentDraft.amount);
    if (!card || !cashAccount || !Number.isFinite(amount) || amount <= 0 || !paymentDraft.date) return;
    await harbor.scheduleCreditCardPayment({
      id: crypto.randomUUID(),
      creditCardAccountId: card.id,
      cashAccountId: cashAccount.id,
      amount,
      scheduledDate: paymentDraft.date,
      status: "planned",
    });
    setPaymentDraft({ cardId: card.id, amount: "", date: paymentDraft.date });
  }

  function plannedForWeek(item: BudgetItem, weekIndex: number) {
    if (item.legacyLineItemId) {
      return harbor.forecastAmounts[item.legacyLineItemId]?.[weekIndex] ?? 0;
    }
    const date = plannedDateForItem(item, harbor.monthStartDate);
    return isWithinWeek(date, harbor.weeks[weekIndex]) ? item.amount : 0;
  }

  function actualForWeek(item: BudgetItem, weekIndex: number) {
    return harbor.currentMonthActualTransactions
      .filter((transaction) => (
        transaction.categoryId === item.categoryId
        && (transaction.plannedItemId === item.id || transaction.merchant === item.name)
        && isWithinWeek(transaction.date, harbor.weeks[weekIndex])
      ))
      .reduce((sum, transaction) => sum + transaction.amount, 0);
  }

  function cashImpactForWeek(item: BudgetItem, weekIndex: number, planned: number) {
    if (item.paymentMethod === "credit_card") return 0;
    const actual = harbor.currentMonthActualTransactions
      .filter((transaction) => (
        (transaction.paymentMethod === "checking" || transaction.paymentMethod === "cash")
        && transaction.categoryId === item.categoryId
        && (transaction.plannedItemId === item.id || transaction.merchant === item.name)
        && isWithinWeek(transaction.date, harbor.weeks[weekIndex])
      ))
      .reduce((sum, transaction) => sum + transaction.amount, 0);
    return actual || planned;
  }

  function incomeForWeek(itemId: string, weekIndex: number) {
    return harbor.forecastAmounts[itemId]?.[weekIndex] ?? 0;
  }

  function incomeEventId(itemId: string, weekIndex: number) {
    return `income-${itemId}-${weekIndex}`;
  }

  function clearedIncomeEvent(itemId: string, weekIndex: number) {
    const id = incomeEventId(itemId, weekIndex);
    return harbor.cashFlowEvents.find((event) => event.id === id && event.status === "cleared");
  }

  function incomeIsHandled(itemId: string, weekIndex: number) {
    const id = incomeEventId(itemId, weekIndex);
    return incomeHandledIds.has(id) || Boolean(clearedIncomeEvent(itemId, weekIndex));
  }

  function setIncomeHandled(id: string, handled: boolean) {
    if (handled) {
      incomeHandledRef.current.add(id);
    } else {
      incomeHandledRef.current.delete(id);
    }
    setIncomeHandledIds(new Set(incomeHandledRef.current));
  }

  async function markIncomeReceived(row: { id: string; name: string }, weekIndex: number, amount: number) {
    if (amount <= 0) return;
    const id = incomeEventId(row.id, weekIndex);
    if (incomeHandledRef.current.has(id) || clearedIncomeEvent(row.id, weekIndex)) return;

    setIncomeHandled(id, true);
    try {
      await harbor.saveCashFlowEvent({
        id,
        date: isoDate(harbor.weeks[weekIndex].start),
        amount,
        direction: "inflow",
        cashAccountId: "checking",
        name: row.name,
        category: "Income",
        status: "cleared",
      });
    } catch (error) {
      setIncomeHandled(id, false);
      throw error;
    }
  }

  function paymentForWeek(payment: CreditCardPayment, weekIndex: number) {
    return isWithinWeek(payment.scheduledDate, harbor.weeks[weekIndex]) && payment.status !== "skipped" ? payment.amount : 0;
  }

  const cardLiability = harbor.cashFlowForecast.projectedCreditCardLiability;

  return (
    <main className="flex-1 bg-harbor-offwhite p-4 text-harbor-navy">
      <div className="mx-auto max-w-[1500px] space-y-4">
        <section className="rounded-2xl border border-harbor-teal-light bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-harbor-teal">Spreadsheet Dock</p>
              <h1 className="mt-1 text-2xl font-bold">{harbor.monthName}</h1>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <label className="grid gap-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-harbor-navy/45">Current Checking Balance</span>
                <input
                  type="number"
                  value={balanceDraft}
                  onChange={(event) => setBalanceDraft(event.target.value)}
                  onBlur={() => void saveBalance()}
                  className="w-48 rounded-lg border border-slate-200 px-3 py-2 text-right text-sm font-semibold"
                />
              </label>
              <button type="button" onClick={() => void saveBalance()} className="rounded-lg bg-harbor-teal px-4 py-2 text-sm font-medium text-white hover:bg-harbor-teal/90">
                Update Balance
              </button>
            </div>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-4">
          <Summary label="Projected Checking Cash" value={harbor.cashFlowForecast.endingBalance} tone={harbor.cashFlowForecast.endingBalance >= 0 ? "green" : "red"} />
          <Summary label="Month Planned Budget" value={harbor.budgetForecast.totalPlanned} />
          <Summary label="Month Remaining Obligations" value={harbor.budgetForecast.totalRemaining} tone={harbor.budgetForecast.totalRemaining >= 0 ? "green" : "red"} />
          <Summary label="Credit Card Liability" value={cardLiability} tone="red" />
        </section>

        <section className="rounded-2xl border border-harbor-teal-light bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
            <div className="inline-flex w-fit rounded-lg border border-slate-200 bg-slate-50 p-1">
              <button type="button" onClick={() => setViewMode("budget")} className={`rounded-md px-3 py-1.5 text-sm font-semibold ${viewMode === "budget" ? "bg-white text-harbor-teal shadow-sm" : "text-harbor-navy/55"}`}>
                Budget View
              </button>
              <button type="button" onClick={() => setViewMode("cash")} className={`rounded-md px-3 py-1.5 text-sm font-semibold ${viewMode === "cash" ? "bg-white text-harbor-teal shadow-sm" : "text-harbor-navy/55"}`}>
                True Cash View
              </button>
            </div>

            <div className="grid gap-2 md:grid-cols-[minmax(150px,1fr)_110px_minmax(130px,1fr)_150px_auto]">
              <select className="rounded-lg border border-slate-200 px-3 py-2 text-sm" value={spendDraft.itemId || (firstSpendItem?.id ?? "")} onChange={(event) => setSpendDraft((draft) => ({ ...draft, itemId: event.target.value }))}>
                {plannedRows.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
              <input className="rounded-lg border border-slate-200 px-3 py-2 text-sm" type="number" min="0" step="0.01" placeholder="Amount" value={spendDraft.amount} onChange={(event) => setSpendDraft((draft) => ({ ...draft, amount: event.target.value }))} />
              <select className="rounded-lg border border-slate-200 px-3 py-2 text-sm" value={spendDraft.accountId} onChange={(event) => setSpendDraft((draft) => ({ ...draft, accountId: event.target.value }))}>
                <option value="">Default method</option>
                {harbor.paymentAccounts.map((account) => <option key={account.id} value={account.id}>{account.label}</option>)}
              </select>
              <input className="rounded-lg border border-slate-200 px-3 py-2 text-sm" type="date" value={spendDraft.date} onChange={(event) => setSpendDraft((draft) => ({ ...draft, date: event.target.value }))} />
              <button type="button" onClick={() => void logSpending()} className="rounded-lg bg-harbor-red px-4 py-2 text-sm font-medium text-white hover:bg-harbor-red/90">
                Log Spending
              </button>
            </div>
          </div>

          <div className="mt-3 grid gap-2 md:grid-cols-[minmax(160px,1fr)_120px_150px_auto]">
            <select className="rounded-lg border border-slate-200 px-3 py-2 text-sm" value={paymentDraft.cardId || (defaultCard?.id ?? "")} onChange={(event) => setPaymentDraft((draft) => ({ ...draft, cardId: event.target.value }))}>
              {creditCards.map((card) => <option key={card.id} value={card.id}>{card.label}</option>)}
            </select>
            <input className="rounded-lg border border-slate-200 px-3 py-2 text-sm" type="number" min="0" step="0.01" placeholder="Payment" value={paymentDraft.amount} onChange={(event) => setPaymentDraft((draft) => ({ ...draft, amount: event.target.value }))} />
            <input className="rounded-lg border border-slate-200 px-3 py-2 text-sm" type="date" value={paymentDraft.date} onChange={(event) => setPaymentDraft((draft) => ({ ...draft, date: event.target.value }))} />
            <button type="button" onClick={() => void schedulePayment()} className="rounded-lg bg-harbor-navy px-4 py-2 text-sm font-medium text-white hover:bg-harbor-navy/90">
              Schedule Card Payment
            </button>
          </div>
        </section>

        <section className="overflow-x-auto rounded-2xl border border-harbor-teal-light bg-white shadow-sm">
          <table className="w-full min-w-[1100px] border-collapse text-sm">
            <thead>
              <tr className="bg-harbor-navy text-white">
                <th className="sticky left-0 z-10 bg-harbor-navy px-3 py-3 text-left">Row</th>
                <th className="px-3 py-3 text-left">Method</th>
                {harbor.weeks.map((week, index) => (
                  <th key={index} className="px-3 py-3 text-center">
                    <div>Week {index + 1}</div>
                    <div className="text-xs font-normal opacity-70">{week.label}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {incomeRows.length > 0 && <SectionRow label="Income" colSpan={2 + harbor.weeks.length} />}
              {incomeRows.map((row) => (
                <tr key={`income-${row.id}`} className="border-b border-slate-100">
                  <RowHeader name={row.name} category="Income" />
                  <td className="px-3 py-3 text-harbor-green">Checking</td>
                  {harbor.weeks.map((_, weekIndex) => {
                    const amount = incomeForWeek(row.id, weekIndex);
                    const cleared = incomeIsHandled(row.id, weekIndex);
                    return (
                      <td key={weekIndex} className={`px-3 py-3 text-center align-top ${cleared ? "bg-harbor-green/5" : ""}`}>
                        {amount ? (
                          <div className="space-y-1">
                            <div className="font-bold text-harbor-green">{formatMoney(amount)}</div>
                            <div className="text-[11px] leading-4 text-harbor-navy/50">
                              {cleared ? "Received/Cleared" : "Expected income"}
                            </div>
                            {cleared ? (
                              <span className="rounded-full bg-harbor-green/10 px-2 py-0.5 text-[11px] font-semibold text-harbor-green">
                                Handled
                              </span>
                            ) : (
                              <button type="button" onClick={() => void markIncomeReceived(row, weekIndex, amount)} className="text-[11px] font-semibold text-harbor-green">
                                Mark received
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}

              <SectionRow label="Bills and Spending" colSpan={2 + harbor.weeks.length} />
              {plannedRows.map((item) => (
                <tr key={item.id} className="border-b border-slate-100">
                  <RowHeader name={item.name} category={item.categoryName ?? item.categoryId} />
                  <td className="px-3 py-3 text-harbor-navy/65">{paymentMethodLabel(item.paymentMethod)}</td>
                  {harbor.weeks.map((_, weekIndex) => {
                    const planned = plannedForWeek(item, weekIndex);
                    const actual = actualForWeek(item, weekIndex);
                    const remaining = Math.max(0, planned - actual);
                    const cashImpact = cashImpactForWeek(item, weekIndex, planned);
                    const primary = viewMode === "budget" ? planned : cashImpact;
                    const secondary = viewMode === "budget"
                      ? `Handled ${formatMoney(actual)} · Remaining ${formatMoney(remaining)}`
                      : item.paymentMethod === "credit_card"
                        ? actual > 0 ? `Handled by card ${formatMoney(actual)}` : "No checking impact"
                        : remaining === 0 && planned > 0 ? "Paid/Cleared" : "Cash Impact";
                    return (
                      <td key={weekIndex} className="px-3 py-3 text-center align-top">
                        {planned > 0 || actual > 0 ? (
                          <div className="space-y-1">
                            <div className={`font-bold ${viewMode === "cash" && primary === 0 ? "text-slate-400" : primary >= 0 ? "text-harbor-navy" : "text-harbor-red"}`}>
                              {primary > 0 ? formatMoney(primary) : "-"}
                            </div>
                            <div className="text-[11px] leading-4 text-harbor-navy/50">{secondary}</div>
                            {remaining > 0 && item.paymentMethod !== "credit_card" && (
                              <button type="button" onClick={() => void markPaid(item, weekIndex, remaining)} className="text-[11px] font-semibold text-harbor-green">
                                Mark paid
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}

              {harbor.creditCardPayments.length > 0 && <SectionRow label="Credit-Card Payments" colSpan={2 + harbor.weeks.length} />}
              {harbor.creditCardPayments.map((payment) => (
                <tr key={payment.id} className="border-b border-slate-100">
                  <RowHeader name="Scheduled card payment" category={creditCards.find((card) => card.id === payment.creditCardAccountId)?.label ?? "Credit card"} />
                  <td className="px-3 py-3 text-harbor-navy/65">Checking</td>
                  {harbor.weeks.map((_, weekIndex) => {
                    const amount = paymentForWeek(payment, weekIndex);
                    return <Cell key={weekIndex} primary={amount ? formatMoney(amount) : "-"} secondary={amount ? payment.status === "paid" ? "Paid" : "Scheduled" : ""} tone="red" />;
                  })}
                </tr>
              ))}

              <tr className="bg-harbor-navy text-white">
                <td className="sticky left-0 z-10 bg-harbor-navy px-3 py-3 font-bold" colSpan={2}>Projected Checking Cash</td>
                {harbor.cashFlowForecast.weekly.map((week) => (
                  <td key={week.key} className={`px-3 py-3 text-center font-bold ${week.endingCash >= 0 ? "text-harbor-green" : "text-harbor-red"}`}>
                    {formatMoney(week.endingCash)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </section>
      </div>
    </main>
  );
}

function Summary({ label, value, tone = "navy" }: { label: string; value: number; tone?: "navy" | "green" | "red" }) {
  const toneClass = tone === "green" ? "text-harbor-green" : tone === "red" ? "text-harbor-red" : "text-harbor-navy";
  return (
    <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-harbor-navy/45">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${toneClass}`}>{formatMoney(value)}</p>
    </div>
  );
}

function SectionRow({ label, colSpan }: { label: string; colSpan: number }) {
  return (
    <tr className="bg-harbor-teal-light/70">
      <td colSpan={colSpan} className="px-3 py-2 text-xs font-bold uppercase tracking-wide text-harbor-navy/60">{label}</td>
    </tr>
  );
}

function RowHeader({ name, category }: { name: string; category: string }) {
  return (
    <td className="sticky left-0 z-10 border-r border-slate-100 bg-white px-3 py-3">
      <div className="font-semibold text-harbor-navy">{name}</div>
      <div className="text-xs text-harbor-navy/45">{category}</div>
    </td>
  );
}

function Cell({ primary, secondary, tone = "navy" }: { primary: string; secondary?: string; tone?: "navy" | "green" | "red" }) {
  const toneClass = tone === "green" ? "text-harbor-green" : tone === "red" ? "text-harbor-red" : "text-harbor-navy";
  return (
    <td className="px-3 py-3 text-center align-top">
      <div className={`font-bold ${primary === "-" ? "text-slate-300" : toneClass}`}>{primary}</div>
      {secondary && <div className="text-[11px] leading-4 text-harbor-navy/50">{secondary}</div>}
    </td>
  );
}
