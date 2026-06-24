"use client";

import { useMemo, useState } from "react";
import type { BudgetItem, PaymentAccount } from "../lib/types";

type BudgetItemDraft = {
  id: string;
  categoryId: string;
  name: string;
  amount: string;
  recurrenceType: string;
  dayOfMonth: string;
  paymentMethod: "checking" | "cash" | "credit_card";
  defaultPaymentAccountId: string;
};

function blankDraft(categories: string[], accounts: PaymentAccount[]): BudgetItemDraft {
  const checking = accounts.find((account) => account.type === "checking" || account.type === "cash");
  return {
    id: "",
    categoryId: categories[0] ?? "",
    name: "",
    amount: "",
    recurrenceType: "monthly",
    dayOfMonth: "1",
    paymentMethod: "checking",
    defaultPaymentAccountId: checking?.id ?? "checking",
  };
}

export function BudgetItemManager({
  budgetItems,
  categories,
  accounts,
  onSave,
  onDeactivate,
}: {
  budgetItems: BudgetItem[];
  categories: string[];
  accounts: PaymentAccount[];
  onSave: (item: BudgetItem) => Promise<void>;
  onDeactivate: (item: BudgetItem) => Promise<void>;
}) {
  const [draft, setDraft] = useState<BudgetItemDraft>(() => blankDraft(categories, accounts));
  const paymentAccounts = useMemo(() => accounts.filter((account) => {
    if (draft.paymentMethod === "credit_card") return account.type === "credit_card";
    return account.type === "checking" || account.type === "cash";
  }), [accounts, draft.paymentMethod]);

  function editItem(item: BudgetItem) {
    const config = item.recurrenceConfig && typeof item.recurrenceConfig === "object" ? item.recurrenceConfig as Record<string, unknown> : {};
    const day = Array.isArray(config.daysOfMonth) && typeof config.daysOfMonth[0] === "number" ? config.daysOfMonth[0] : 1;
    setDraft({
      id: item.id,
      categoryId: item.categoryName ?? item.categoryId,
      name: item.name,
      amount: String(item.amount),
      recurrenceType: item.recurrenceType || "monthly",
      dayOfMonth: String(day),
      paymentMethod: item.paymentMethod === "credit_card" ? "credit_card" : item.paymentMethod === "cash" ? "cash" : "checking",
      defaultPaymentAccountId: item.defaultPaymentAccountId ?? (item.paymentMethod === "credit_card" ? accounts.find((account) => account.type === "credit_card")?.id ?? "" : "checking"),
    });
  }

  async function saveDraft() {
    const amount = Number(draft.amount);
    if (!draft.categoryId || !draft.name.trim() || !Number.isFinite(amount) || amount < 0) return;
    const paymentAccount = paymentAccounts.find((account) => account.id === draft.defaultPaymentAccountId) ?? paymentAccounts[0];

    await onSave({
      id: draft.id || crypto.randomUUID(),
      categoryId: draft.categoryId,
      categoryName: draft.categoryId,
      name: draft.name.trim(),
      amount,
      recurrenceType: draft.recurrenceType,
      recurrenceConfig: { type: draft.recurrenceType, daysOfMonth: [Math.max(1, Math.min(31, Number(draft.dayOfMonth) || 1))] },
      defaultPaymentAccountId: paymentAccount?.id ?? draft.defaultPaymentAccountId,
      defaultCashAccountId: "checking",
      paymentMethod: draft.paymentMethod,
      active: true,
    });
    setDraft(blankDraft(categories, accounts));
  }

  return (
    <section className="rounded-2xl border border-harbor-teal-light bg-white shadow-sm">
      <div className="border-b border-harbor-teal-light px-4 py-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-harbor-teal">Budget Items</p>
        <h2 className="mt-1 text-xl font-bold text-harbor-navy">Plan Budget Items</h2>
      </div>
      <div className="grid gap-3 p-4 md:grid-cols-6">
        <input className="rounded-lg border border-slate-200 px-3 py-2 text-sm md:col-span-2" placeholder="Budget item name" value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} />
        <select className="rounded-lg border border-slate-200 px-3 py-2 text-sm" value={draft.categoryId} onChange={(event) => setDraft((current) => ({ ...current, categoryId: event.target.value }))}>
          {categories.map((category) => <option key={category} value={category}>{category}</option>)}
        </select>
        <input className="rounded-lg border border-slate-200 px-3 py-2 text-sm" type="number" min="0" step="0.01" placeholder="Budget amount" value={draft.amount} onChange={(event) => setDraft((current) => ({ ...current, amount: event.target.value }))} />
        <select className="rounded-lg border border-slate-200 px-3 py-2 text-sm" value={draft.recurrenceType} onChange={(event) => setDraft((current) => ({ ...current, recurrenceType: event.target.value }))}>
          <option value="monthly">Monthly</option>
          <option value="weekly">Weekly</option>
          <option value="oneTime">One-time</option>
        </select>
        <input className="rounded-lg border border-slate-200 px-3 py-2 text-sm" type="number" min="1" max="31" value={draft.dayOfMonth} onChange={(event) => setDraft((current) => ({ ...current, dayOfMonth: event.target.value }))} />
        <select className="rounded-lg border border-slate-200 px-3 py-2 text-sm" value={draft.paymentMethod} onChange={(event) => setDraft((current) => ({ ...current, paymentMethod: event.target.value as BudgetItemDraft["paymentMethod"], defaultPaymentAccountId: "" }))}>
          <option value="checking">Checking</option>
          <option value="cash">Cash</option>
          <option value="credit_card">Credit card</option>
        </select>
        <select className="rounded-lg border border-slate-200 px-3 py-2 text-sm md:col-span-2" value={draft.defaultPaymentAccountId} onChange={(event) => setDraft((current) => ({ ...current, defaultPaymentAccountId: event.target.value }))}>
          {paymentAccounts.map((account) => <option key={account.id} value={account.id}>{account.label}</option>)}
        </select>
        <button type="button" onClick={() => void saveDraft()} className="rounded-lg bg-harbor-teal px-4 py-2 text-sm font-medium text-white hover:bg-harbor-teal/90">
          {draft.id ? "Save Budget Item" : "Add Budget Item"}
        </button>
        {draft.id && (
          <button type="button" onClick={() => setDraft(blankDraft(categories, accounts))} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-harbor-navy/60 hover:bg-slate-50">
            Cancel Edit
          </button>
        )}
      </div>
      <div className="divide-y divide-slate-100 border-t border-harbor-teal-light">
        {budgetItems.filter((item) => item.active).map((item) => (
          <div key={item.id} className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-semibold text-harbor-navy">{item.name}</p>
              <p className="text-xs text-harbor-navy/50">{item.categoryName ?? item.categoryId} · {item.paymentMethod} · ${item.amount.toLocaleString()}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={() => editItem(item)} className="text-xs font-semibold text-harbor-teal">Edit</button>
              <button type="button" onClick={() => void onDeactivate(item)} className="text-xs font-semibold text-slate-500">Deactivate</button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
