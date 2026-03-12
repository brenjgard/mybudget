"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// ── Types ──────────────────────────────────────────────────────────────────
export type PaymentMethod =
  | "checking"
  | "credit-1"
  | "credit-2"
  | "credit-3";

export type FrequencyType =
  | "every-week"
  | "every-other-week"
  | "twice-a-month"
  | "once-a-month-1"
  | "once-a-month-2"
  | "once-a-month-3"
  | "once-a-month-4"
  | "quarterly"
  | "annually"
  | "week-1"
  | "week-2"
  | "week-3"
  | "week-4"
  | "week-5"
  | "biweekly-odd"
  | "biweekly-even";

export type LineItem = {
  id: string;
  category: string;
  name: string;
  defaultAmount: number;
  paymentMethod: PaymentMethod;
  isIncome: boolean;
  frequency: FrequencyType;
  anchorDate?: string;   // YYYY-MM-DD reference date for biweekly/every-other-week
  anchorMonth?: number;  // 1-12, which month quarterly/annually items start
};

export type AppSettings = {
  checkingBalance: number;
  creditCards: { id: PaymentMethod; label: string }[];
  categories: string[];
  lineItems: LineItem[];
};

// ── Helpers ────────────────────────────────────────────────────────────────
function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

const FREQ_LABELS: Record<FrequencyType, string> = {
  "every-week": "Every week",
  "every-other-week": "Every other week",
  "twice-a-month": "Twice a month (weeks 1 & 3)",
  "once-a-month-1": "Once a month – Week 1",
  "once-a-month-2": "Once a month – Week 2",
  "once-a-month-3": "Once a month – Week 3",
  "once-a-month-4": "Once a month – Week 4",
  "quarterly": "Quarterly",
  "annually": "Annually",
  "week-1": "Week 1 only",
  "week-2": "Week 2 only",
  "week-3": "Week 3 only",
  "week-4": "Week 4 only",
  "week-5": "Week 5 only",
  "biweekly-odd": "Bi-weekly (weeks 1 & 3)",
  "biweekly-even": "Bi-weekly (weeks 2 & 4)",
};

const DEFAULT_CATEGORIES = [
  "Pay", "Standard Bills", "Food", "Pets", "Car Stuff",
  "Subscriptions", "Savings", "Credit Cards", "Home Maintenance",
  "Personal Care", "Donations", "Taxes", "Other",
];

// ── Component ──────────────────────────────────────────────────────────────
export default function Setup() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const TOTAL_STEPS = 5;

  // Step 1 — Balance
  const [checkingBalance, setCheckingBalance] = useState("");

  // Step 2 — Credit cards
  const [creditCards, setCreditCards] = useState<{ id: PaymentMethod; label: string }[]>([]);
  const [newCardLabel, setNewCardLabel] = useState("");

  // Step 3 — Categories
  const [categories, setCategories] = useState<string[]>([]);
  const [newCat, setNewCat] = useState("");

  // Step 4 — Line items
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [activeCat, setActiveCat] = useState<string>("");
  const [form, setForm] = useState({
    name: "",
    amount: "",
    isIncome: false,
    paymentMethod: "checking" as PaymentMethod,
    frequency: "every-week" as FrequencyType,
    anchorDate: "",
    anchorMonth: undefined as number | undefined,
  });

  // ── Step helpers ───────────────────────────────────────────────────────
  function addCard() {
    const label = newCardLabel.trim();
    if (!label || creditCards.length >= 3) return;
    const id = `credit-${creditCards.length + 1}` as PaymentMethod;
    setCreditCards((p) => [...p, { id, label }]);
    setNewCardLabel("");
  }

  function toggleCategory(cat: string) {
    setCategories((p) =>
      p.includes(cat) ? p.filter((c) => c !== cat) : [...p, cat]
    );
  }

  function addCustomCat() {
    const c = newCat.trim();
    if (!c || categories.includes(c)) return;
    setCategories((p) => [...p, c]);
    setNewCat("");
  }

  function addLineItem() {
    if (!form.name.trim() || !activeCat) return;
    const item: LineItem = {
      id: uid(),
      category: activeCat,
      name: form.name.trim(),
      defaultAmount: Number(form.amount) || 0,
      isIncome: form.isIncome,
      paymentMethod: form.paymentMethod,
      frequency: form.frequency,
      anchorDate: form.anchorDate || undefined,
      anchorMonth: form.anchorMonth,
    };
    setLineItems((p) => [...p, item]);
    setForm({ name: "", amount: "", isIncome: false, paymentMethod: "checking", frequency: "every-week", anchorDate: "", anchorMonth: undefined });
  }

  function removeItem(id: string) {
    setLineItems((p) => p.filter((i) => i.id !== id));
  }

  function finish() {
    const settings: AppSettings = {
      checkingBalance: Number(checkingBalance) || 0,
      creditCards,
      categories,
      lineItems,
    };
    localStorage.setItem("gardner_budget_settings", JSON.stringify(settings));
    router.push("/");
  }

  const cardOptions: { value: PaymentMethod; label: string }[] = [
    { value: "checking", label: "🏦 Checking" },
    ...creditCards.map((c) => ({ value: c.id, label: `💳 ${c.label}` })),
  ];

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <main className="flex-1 bg-gradient-to-br from-[#1B3A5C] to-[#0f2a45] flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl p-8 space-y-6">

        {/* Progress */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-slate-400">
            <span>Step {step} of {TOTAL_STEPS}</span>
            <span>{Math.round((step / TOTAL_STEPS) * 100)}%</span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2">
            <div
              className="bg-harbor-teal h-2 rounded-full transition-all duration-500"
              style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
            />
          </div>
        </div>

        {/* ── Step 1: Balance ── */}
        {step === 1 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold">Welcome to Harbor 👋</h2>
              <p className="text-slate-500 mt-1">Let's set up your budget. First, what's your current checking account balance?</p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Current Balance</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-medium">$</span>
                <input
                  type="number"
                  className="w-full border-2 rounded-xl pl-8 pr-4 py-3 text-xl font-semibold focus:outline-none focus:border-harbor-teal"
                  placeholder="3,901.00"
                  value={checkingBalance}
                  onChange={(e) => setCheckingBalance(e.target.value)}
                />
              </div>
              <p className="text-xs text-slate-400 mt-2">You can update this anytime on the main budget page.</p>
            </div>
          </div>
        )}

        {/* ── Step 2: Credit Cards ── */}
        {step === 2 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold">Credit Cards 💳</h2>
              <p className="text-slate-500 mt-1">Add any credit cards you want to track. You can add up to 3. Skip if you only use checking.</p>
            </div>
            <div className="flex gap-2">
              <input
                className="flex-1 border-2 rounded-xl px-4 py-2 focus:outline-none focus:border-harbor-teal"
                placeholder="e.g. Capital One, Disney Card..."
                value={newCardLabel}
                onChange={(e) => setNewCardLabel(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addCard()}
              />
              <button
                onClick={addCard}
                disabled={creditCards.length >= 3}
                className="px-4 py-2 bg-harbor-teal text-white rounded-xl hover:bg-[#22857a] disabled:opacity-40"
              >
                Add
              </button>
            </div>
            {creditCards.length > 0 && (
              <ul className="space-y-2">
                {creditCards.map((c) => (
                  <li key={c.id} className="flex items-center justify-between bg-slate-50 rounded-xl px-4 py-3">
                    <span className="font-medium">💳 {c.label}</span>
                    <button
                      onClick={() => setCreditCards((p) => p.filter((x) => x.id !== c.id))}
                      className="text-red-400 hover:text-red-600 text-sm"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {creditCards.length === 0 && (
              <p className="text-sm text-slate-400 italic">No cards added yet — that's fine!</p>
            )}
          </div>
        )}

        {/* ── Step 3: Categories ── */}
        {step === 3 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold">Dock Categories 📋</h2>
              <p className="text-slate-500 mt-1">Pick the categories that apply to you, or add your own.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {DEFAULT_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => toggleCategory(cat)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium border-2 transition-all
                    ${categories.includes(cat)
                      ? "bg-harbor-teal text-white border-harbor-teal"
                      : "bg-white text-slate-600 border-slate-200 hover:border-harbor-teal"}`}
                >
                  {categories.includes(cat) ? "✓ " : ""}{cat}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                className="flex-1 border-2 rounded-xl px-4 py-2 focus:outline-none focus:border-harbor-teal"
                placeholder="Add custom category..."
                value={newCat}
                onChange={(e) => setNewCat(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addCustomCat()}
              />
              <button onClick={addCustomCat} className="px-4 py-2 bg-harbor-teal text-white rounded-xl hover:bg-[#22857a]">
                Add
              </button>
            </div>
            {categories.length > 0 && (
              <p className="text-sm text-slate-500">{categories.length} categories selected</p>
            )}
          </div>
        )}

        {/* ── Step 4: Line Items ── */}
        {step === 4 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-2xl font-bold">Line Items 📝</h2>
              <p className="text-slate-500 mt-1">Add your waves and ripples for each category.</p>
            </div>

            {/* Category tabs */}
            <div className="flex flex-wrap gap-2">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCat(cat)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium border-2 transition-all
                    ${activeCat === cat
                      ? "bg-harbor-navy text-white border-harbor-navy"
                      : "bg-white text-slate-600 border-slate-200 hover:border-harbor-teal hover:text-harbor-teal"}`}
                >
                  {cat}
                  {lineItems.filter(i => i.category === cat).length > 0 && (
                    <span className="ml-1.5 bg-harbor-teal text-white text-xs rounded-full px-1.5">
                      {lineItems.filter(i => i.category === cat).length}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {activeCat ? (
              <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
                <h3 className="font-semibold text-slate-700">{activeCat}</h3>

                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="text-xs text-slate-500 block mb-1">Item Name</label>
                    <input
                      className="w-full border-2 rounded-xl px-3 py-2 focus:outline-none focus:border-harbor-teal"
                      placeholder="e.g. Mortgage, Netflix, Salary..."
                      value={form.name}
                      onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                      onKeyDown={(e) => e.key === "Enter" && addLineItem()}
                    />
                  </div>

                  <div>
                    <label className="text-xs text-slate-500 block mb-1">Amount</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                      <input
                        type="number"
                        className="w-full border-2 rounded-xl pl-7 pr-3 py-2 focus:outline-none focus:border-harbor-teal"
                        placeholder="0.00"
                        value={form.amount}
                        onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-slate-500 block mb-1">Type</label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setForm((p) => ({ ...p, isIncome: false }))}
                        className={`flex-1 py-2 rounded-xl text-sm font-medium border-2 ${!form.isIncome ? "bg-red-50 border-red-400 text-red-700" : "border-slate-200 text-slate-500"}`}
                      >
                        Ripple
                      </button>
                      <button
                        onClick={() => setForm((p) => ({ ...p, isIncome: true }))}
                        className={`flex-1 py-2 rounded-xl text-sm font-medium border-2 ${form.isIncome ? "bg-green-50 border-green-400 text-green-700" : "border-slate-200 text-slate-500"}`}
                      >
                        Wave
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-slate-500 block mb-1">Payment Method</label>
                    <select
                      className="w-full border-2 rounded-xl px-3 py-2 focus:outline-none focus:border-harbor-teal"
                      value={form.paymentMethod}
                      onChange={(e) => setForm((p) => ({ ...p, paymentMethod: e.target.value as PaymentMethod }))}
                    >
                      {cardOptions.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs text-slate-500 block mb-1">When does it hit?</label>
                    <select
                      className="w-full border-2 rounded-xl px-3 py-2 focus:outline-none focus:border-harbor-teal"
                      value={form.frequency}
                      onChange={(e) => setForm((p) => ({ ...p, frequency: e.target.value as FrequencyType }))}
                    >
                      {Object.entries(FREQ_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                  </div>
                  {(form.frequency === "every-other-week" ||
                    form.frequency === "biweekly-odd" ||
                    form.frequency === "biweekly-even") && (
                    <div className="col-span-2">
                      <label className="text-xs text-slate-500 block mb-1">
                        Anchor Date — a Friday this item is paid on
                      </label>
                      <input
                        type="date"
                        className="w-full border-2 rounded-xl px-3 py-2 focus:outline-none focus:border-harbor-teal"
                        value={form.anchorDate ?? ""}
                        onChange={(e) => setForm((p) => ({ ...p, anchorDate: e.target.value }))}
                      />
                      <p className="text-xs text-slate-400 mt-1">e.g. 2026-03-06 for the Mar 6 pay cycle</p>
                    </div>
                  )}
                  {(form.frequency === "quarterly" || form.frequency === "annually") && (
                    <div className="col-span-2">
                      <label className="text-xs text-slate-500 block mb-1">Starting Month</label>
                      <select
                        className="w-full border-2 rounded-xl px-3 py-2 focus:outline-none focus:border-harbor-teal"
                        value={form.anchorMonth ?? 1}
                        onChange={(e) => setForm((p) => ({ ...p, anchorMonth: Number(e.target.value) }))}
                      >
                        {["January","February","March","April","May","June","July","August","September","October","November","December"].map((m, i) => (
                          <option key={i + 1} value={i + 1}>{m}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                <button
                  onClick={addLineItem}
                  className="w-full py-2 bg-harbor-teal text-white rounded-xl hover:bg-[#22857a] font-medium"
                >
                  + Add Item
                </button>

                {/* Items list for active category */}
                {lineItems.filter(i => i.category === activeCat).length > 0 && (
                  <ul className="space-y-1 mt-2">
                    {lineItems.filter(i => i.category === activeCat).map((item) => (
                      <li key={item.id} className="flex items-center justify-between bg-white rounded-xl px-3 py-2 text-sm">
                        <span className="font-medium">{item.name}</span>
                        <span className="text-slate-400 text-xs">{FREQ_LABELS[item.frequency]}</span>
                        <span className={item.isIncome ? "text-green-600 font-semibold" : "text-red-600 font-semibold"}>
                          {item.isIncome ? "+" : "-"}${item.defaultAmount}
                        </span>
                        <button onClick={() => removeItem(item.id)} className="text-red-400 hover:text-red-600 ml-2">✕</button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <p className="text-sm text-slate-400 italic text-center py-4">← Select a category above to start adding items</p>
            )}
          </div>
        )}

        {/* ── Step 5: Review ── */}
        {step === 5 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold">Review & Launch 🚀</h2>
              <p className="text-slate-500 mt-1">Here's a summary of your setup.</p>
            </div>
            <div className="space-y-3">
              <div className="bg-slate-50 rounded-2xl p-4 flex justify-between">
                <span className="text-slate-600">Anchor</span>
                <span className="font-bold text-green-700">${Number(checkingBalance).toLocaleString()}</span>
              </div>
              <div className="bg-slate-50 rounded-2xl p-4 flex justify-between">
                <span className="text-slate-600">Credit Cards</span>
                <span className="font-medium">{creditCards.length === 0 ? "None" : creditCards.map(c => c.label).join(", ")}</span>
              </div>
              <div className="bg-slate-50 rounded-2xl p-4 flex justify-between">
                <span className="text-slate-600">Categories</span>
                <span className="font-medium">{categories.length}</span>
              </div>
              <div className="bg-slate-50 rounded-2xl p-4 flex justify-between">
                <span className="text-slate-600">Line Items</span>
                <span className="font-medium">{lineItems.length} items</span>
              </div>
              <div className="bg-slate-50 rounded-2xl p-4 flex justify-between">
                <span className="text-slate-600">Wave Sources</span>
                <span className="font-medium text-green-700">{lineItems.filter(i => i.isIncome).length}</span>
              </div>
              <div className="bg-slate-50 rounded-2xl p-4 flex justify-between">
                <span className="text-slate-600">Ripple Items</span>
                <span className="font-medium text-red-600">{lineItems.filter(i => !i.isIncome).length}</span>
              </div>
            </div>
            <p className="text-xs text-slate-400">You can always edit categories and line items later from the settings page.</p>
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between pt-2">
          {step > 1 ? (
            <button
              onClick={() => setStep((s) => s - 1)}
              className="px-6 py-2 rounded-xl border-2 border-slate-200 text-slate-600 hover:border-slate-400"
            >
              ← Back
            </button>
          ) : <div />}

          {step < TOTAL_STEPS ? (
            <button
              onClick={() => setStep((s) => s + 1)}
              disabled={step === 1 && !checkingBalance}
              className="px-6 py-2 rounded-xl bg-harbor-teal text-white hover:bg-[#22857a] disabled:opacity-40 font-medium transition-colors"
            >
              Continue →
            </button>
          ) : (
            <button
              onClick={finish}
              className="px-8 py-2 rounded-xl bg-harbor-green text-white hover:bg-[#24b047] font-semibold transition-colors"
            >
              Set Sail 🚀
            </button>
          )}
        </div>

      </div>
    </main>
  );
}