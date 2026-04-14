"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import { useRouter } from "next/navigation";
import { localRepo } from "../lib/local-repo";
import { AppSettings, FrequencyType, LineItem } from "../lib/types";

// ── Types ──────────────────────────────────────────────────────────────────
// ── Helpers ────────────────────────────────────────────────────────────────
function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

const FREQ_LABELS: Record<FrequencyType, string> = {
  "every-week":      "Every week",
  "every-other-week":"Every other week",
  "twice-a-month":   "Twice a month (weeks 1 & 3)",
  "once-a-month-1":  "Once a month – Week 1",
  "once-a-month-2":  "Once a month – Week 2",
  "once-a-month-3":  "Once a month – Week 3",
  "once-a-month-4":  "Once a month – Week 4",
  "quarterly":       "Quarterly",
  "annually":        "Annually",
  "week-1":          "Week 1 only",
  "week-2":          "Week 2 only",
  "week-3":          "Week 3 only",
  "week-4":          "Week 4 only",
  "week-5":          "Week 5 only",
  "biweekly-odd":    "Bi-weekly (weeks 1 & 3)",
  "biweekly-even":   "Bi-weekly (weeks 2 & 4)",
};

const DEFAULT_CATEGORIES = [
  "Pay", "Standard Bills", "Food", "Pets", "Car Stuff",
  "Subscriptions", "Savings", "Credit Cards", "Home Maintenance",
  "Personal Care", "Donations", "Taxes", "Other",
];

// ── Icons ──────────────────────────────────────────────────────────────────
function AnchorIcon() {
  return (
    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#1B3A5C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="5" r="3" />
      <line x1="12" y1="8" x2="12" y2="22" />
      <path d="M5 15H2a10 10 0 0 0 20 0h-3" />
    </svg>
  );
}

function ArrowUpIcon() {
  return (
    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#2DC653" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="19" x2="12" y2="5" />
      <polyline points="5 12 12 5 19 12" />
    </svg>
  );
}

function ArrowDownIcon() {
  return (
    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#E63946" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <polyline points="19 12 12 19 5 12" />
    </svg>
  );
}

function DockIcon() {
  return (
    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#2A9D8F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="2" y1="20" x2="22" y2="20" />
      <line x1="2" y1="13" x2="22" y2="13" />
      <line x1="6" y1="13" x2="6" y2="20" />
      <line x1="12" y1="9" x2="12" y2="20" />
      <line x1="18" y1="13" x2="18" y2="20" />
      <path d="M9 9h6M12 5v4" />
    </svg>
  );
}

// ── Step metadata ──────────────────────────────────────────────────────────
const STEP_META = [
  { icon: <AnchorIcon />,    bg: "bg-blue-100", label: "Anchor"  },
  { icon: <ArrowUpIcon />,   bg: "bg-green-50", label: "Waves"   },
  { icon: <ArrowDownIcon />, bg: "bg-red-50",   label: "Ripples" },
  { icon: <DockIcon />,      bg: "bg-teal-50",  label: "Dock"    },
];

// ── Item form ──────────────────────────────────────────────────────────────
type FormState = {
  name: string;
  amount: string;
  category: string;
  frequency: FrequencyType;
  anchorDate: string;
  anchorMonth: number | undefined;
};

function ItemForm({
  form,
  setForm,
  onAdd,
  isIncome,
}: {
  form: FormState;
  setForm: Dispatch<SetStateAction<FormState>>;
  onAdd: () => void;
  isIncome: boolean;
}) {
  return (
    <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
      {/* Name */}
      <div>
        <label className="text-xs text-slate-500 block mb-1">Name</label>
        <input
          className="w-full border-2 border-white focus:border-harbor-teal rounded-xl px-3 py-2.5 focus:outline-none bg-white transition-colors"
          placeholder={isIncome ? "e.g. Salary, Freelance..." : "e.g. Rent, Spotify, Groceries..."}
          value={form.name}
          onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
          onKeyDown={(e) => e.key === "Enter" && onAdd()}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Amount */}
        <div>
          <label className="text-xs text-slate-500 block mb-1">Amount</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
            <input
              type="number"
              className="w-full border-2 border-white focus:border-harbor-teal rounded-xl pl-7 pr-3 py-2.5 focus:outline-none bg-white transition-colors"
              placeholder="0.00"
              value={form.amount}
              onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
            />
          </div>
        </div>

        {/* Category */}
        <div>
          <label className="text-xs text-slate-500 block mb-1">Category</label>
          <select
            className="w-full border-2 border-white focus:border-harbor-teal rounded-xl px-3 py-2.5 focus:outline-none bg-white transition-colors"
            value={form.category}
            onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
          >
            {DEFAULT_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        {/* Frequency */}
        <div className="col-span-2">
          <label className="text-xs text-slate-500 block mb-1">Frequency</label>
          <select
            className="w-full border-2 border-white focus:border-harbor-teal rounded-xl px-3 py-2.5 focus:outline-none bg-white transition-colors"
            value={form.frequency}
            onChange={(e) => setForm((p) => ({ ...p, frequency: e.target.value as FrequencyType }))}
          >
            {Object.entries(FREQ_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>

        {/* Anchor Date — biweekly only */}
        {(form.frequency === "every-other-week" ||
          form.frequency === "biweekly-odd" ||
          form.frequency === "biweekly-even") && (
          <div className="col-span-2">
            <label className="text-xs text-slate-500 block mb-1">
              Anchor Date — a Friday this item is paid on
            </label>
            <input
              type="date"
              className="w-full border-2 border-white focus:border-harbor-teal rounded-xl px-3 py-2.5 focus:outline-none bg-white transition-colors"
              value={form.anchorDate ?? ""}
              onChange={(e) => setForm((p) => ({ ...p, anchorDate: e.target.value }))}
            />
            <p className="text-xs text-slate-400 mt-1">e.g. 2026-03-06 for the Mar 6 pay cycle</p>
          </div>
        )}

        {/* Starting Month — quarterly/annually only */}
        {(form.frequency === "quarterly" || form.frequency === "annually") && (
          <div className="col-span-2">
            <label className="text-xs text-slate-500 block mb-1">Starting Month</label>
            <select
              className="w-full border-2 border-white focus:border-harbor-teal rounded-xl px-3 py-2.5 focus:outline-none bg-white transition-colors"
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
        onClick={onAdd}
        disabled={!form.name.trim()}
        className={`w-full py-2.5 text-white rounded-xl font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
          isIncome
            ? "bg-harbor-green hover:bg-[#24b047]"
            : "bg-harbor-red hover:bg-[#c9313d]"
        }`}
      >
        + Add {isIncome ? "Wave" : "Ripple"}
      </button>
    </div>
  );
}

// ── Item list (compact) ────────────────────────────────────────────────────
function ItemList({
  items,
  onRemove,
}: {
  items: LineItem[];
  onRemove: (id: string) => void;
}) {
  return (
    <ul className="space-y-1.5">
      {items.map((item) => (
        <li key={item.id} className="flex items-center justify-between bg-white border border-slate-100 rounded-xl px-3 py-2">
          <div className="min-w-0 flex-1">
            <span className="font-medium text-sm">{item.name}</span>
            <span className="text-xs text-slate-400 ml-2">{item.category}</span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 ml-3">
            <span className={`text-sm font-semibold tabular-nums ${item.isIncome ? "text-harbor-green" : "text-harbor-red"}`}>
              {item.isIncome ? "+" : "-"}${item.defaultAmount}
            </span>
            <span className="text-xs text-slate-400 hidden sm:inline">{FREQ_LABELS[item.frequency]}</span>
            <button
              onClick={() => onRemove(item.id)}
              className="text-slate-300 hover:text-harbor-red transition-colors leading-none"
            >
              ✕
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

// ── Component ──────────────────────────────────────────────────────────────
const BLANK_FORM: FormState = {
  name: "",
  amount: "",
  category: "Pay",
  frequency: "every-week",
  anchorDate: "",
  anchorMonth: undefined,
};

export default function Setup() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const TOTAL_STEPS = 4;

  // Step 1 — Balance
  const [checkingBalance, setCheckingBalance] = useState("");

  // Steps 2 & 3 — Line items (shared list, isIncome derived from step)
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [form, setForm] = useState<FormState>({ ...BLANK_FORM });

  // ── Helpers ───────────────────────────────────────────────────────────
  function addLineItem() {
    if (!form.name.trim()) return;
    const isIncome = step === 2;
    setLineItems((p) => [
      ...p,
      {
        id: uid(),
        category: form.category || "Other",
        name: form.name.trim(),
        defaultAmount: Number(form.amount) || 0,
        isIncome,
        paymentMethod: "checking",
        frequency: form.frequency,
        anchorDate: form.anchorDate || undefined,
        anchorMonth: form.anchorMonth,
      },
    ]);
    setForm((p) => ({ ...p, name: "", amount: "", anchorDate: "", anchorMonth: undefined }));
  }

  function removeItem(id: string) {
    setLineItems((p) => p.filter((i) => i.id !== id));
  }

  function goNext() {
    // Reset form with sensible defaults for the upcoming step
    if (step === 2) setForm({ ...BLANK_FORM, category: "Standard Bills" });
    else setForm({ ...BLANK_FORM });
    setStep((s) => s + 1);
  }

  function goBack() {
    if (step === 3) setForm({ ...BLANK_FORM, category: "Pay" });
    else setForm({ ...BLANK_FORM });
    setStep((s) => s - 1);
  }

  function finish() {
    // Derive categories from the items the user actually added
    const categories = [...new Set(lineItems.map((i) => i.category).filter(Boolean))];
    const settings: AppSettings = {
      checkingBalance: Number(checkingBalance) || 0,
      creditCards: [],
      categories,
      lineItems,
    };
    localRepo.saveSettings(settings);
    router.push("/");
  }

  const meta = STEP_META[step - 1];

  // Group items by category for Dock review
  const grouped = lineItems.reduce<Record<string, LineItem[]>>((acc, item) => {
    (acc[item.category] ??= []).push(item);
    return acc;
  }, {});

  const waves   = lineItems.filter((i) => i.isIncome);
  const ripples = lineItems.filter((i) => !i.isIncome);

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <main className="flex-1 bg-gradient-to-br from-blue-50 to-cyan-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-xl w-full max-w-2xl overflow-hidden">

        {/* Top accent bar */}
        <div className="h-1.5 bg-gradient-to-r from-harbor-navy via-harbor-teal to-harbor-teal-light" />

        <div className="p-8 space-y-6">

          {/* Progress dots */}
          <div className="flex justify-center items-center gap-2">
            {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
              <div
                key={i}
                className={`rounded-full transition-all duration-300 ${
                  i + 1 === step   ? "w-6 h-2.5 bg-harbor-navy" :
                  i + 1 < step     ? "w-2.5 h-2.5 bg-harbor-teal" :
                                     "w-2.5 h-2.5 bg-slate-200"
                }`}
              />
            ))}
          </div>

          {/* Step icon */}
          <div className="flex justify-center">
            <div className={`w-20 h-20 rounded-full ${meta.bg} flex items-center justify-center`}>
              {meta.icon}
            </div>
          </div>

          {/* Step content */}
          <div key={step} style={{ animation: "stepFadeIn 0.25s ease-out" }} className="space-y-5">

            {/* ── Step 1: Anchor ── */}
            {step === 1 && (
              <>
                <div className="text-center space-y-1">
                  <h2 className="text-2xl font-bold text-harbor-navy">Let's set your anchor</h2>
                  <p className="text-slate-500 text-sm">How much cash do you have today?</p>
                </div>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-lg font-medium">$</span>
                  <input
                    type="number"
                    autoFocus
                    placeholder="3,901.00"
                    value={checkingBalance}
                    onChange={(e) => setCheckingBalance(e.target.value)}
                    className="w-full border-2 border-slate-200 focus:border-harbor-teal rounded-2xl pl-10 pr-4 py-4 text-xl font-semibold text-slate-700 focus:outline-none transition-colors text-right"
                  />
                </div>
                <div className="bg-blue-50 rounded-2xl p-4">
                  <p className="text-sm text-blue-700 text-center italic leading-relaxed">
                    "No anchor is too small. Every journey starts somewhere."
                  </p>
                </div>
              </>
            )}

            {/* ── Step 2: Waves (income) ── */}
            {step === 2 && (
              <>
                <div className="text-center space-y-1">
                  <h2 className="text-2xl font-bold text-harbor-navy">Add your waves</h2>
                  <p className="text-slate-500 text-sm">Income sources — salary, freelance, side gigs</p>
                </div>

                <ItemForm form={form} setForm={setForm} onAdd={addLineItem} isIncome={true} />

                {waves.length > 0 && (
                  <div>
                    <p className="text-xs text-slate-400 uppercase tracking-wide font-semibold mb-2">
                      {waves.length} wave{waves.length !== 1 ? "s" : ""} added
                    </p>
                    <ItemList items={waves} onRemove={removeItem} />
                  </div>
                )}
              </>
            )}

            {/* ── Step 3: Ripples (expenses) ── */}
            {step === 3 && (
              <>
                <div className="text-center space-y-1">
                  <h2 className="text-2xl font-bold text-harbor-navy">Add your ripples</h2>
                  <p className="text-slate-500 text-sm">Regular expenses — bills, subscriptions, groceries</p>
                </div>

                <ItemForm form={form} setForm={setForm} onAdd={addLineItem} isIncome={false} />

                {ripples.length > 0 && (
                  <div>
                    <p className="text-xs text-slate-400 uppercase tracking-wide font-semibold mb-2">
                      {ripples.length} ripple{ripples.length !== 1 ? "s" : ""} added
                    </p>
                    <ItemList items={ripples} onRemove={removeItem} />
                  </div>
                )}
              </>
            )}

            {/* ── Step 4: Dock — categorized review ── */}
            {step === 4 && (
              <>
                <div className="text-center space-y-1">
                  <h2 className="text-2xl font-bold text-harbor-navy">Your dock is ready</h2>
                  <p className="text-slate-500 text-sm">Review everything before you set sail.</p>
                </div>

                {lineItems.length === 0 ? (
                  <div className="bg-slate-50 rounded-2xl p-8 text-center">
                    <p className="text-slate-400 text-sm">No items added yet — go back to add waves or ripples.</p>
                  </div>
                ) : (
                  <div className="space-y-4 max-h-80 overflow-y-auto pr-1">
                    {Object.entries(grouped).map(([cat, items]) => (
                      <div key={cat}>
                        <p className="text-xs text-harbor-navy/50 uppercase tracking-wide font-semibold mb-1.5 px-1">
                          {cat}
                        </p>
                        <div className="space-y-1.5">
                          {items.map((item) => (
                            <div key={item.id} className="flex items-center justify-between bg-slate-50 rounded-xl px-4 py-2.5">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${
                                  item.isIncome
                                    ? "bg-harbor-green/15 text-harbor-green"
                                    : "bg-harbor-red/10 text-harbor-red"
                                }`}>
                                  {item.isIncome ? "Wave" : "Ripple"}
                                </span>
                                <span className="font-medium text-sm truncate">{item.name}</span>
                              </div>
                              <div className="flex items-center gap-3 flex-shrink-0 ml-2">
                                <span className={`text-sm font-semibold tabular-nums ${item.isIncome ? "text-harbor-green" : "text-harbor-red"}`}>
                                  {item.isIncome ? "+" : "-"}${item.defaultAmount}
                                </span>
                                <span className="text-xs text-slate-400 hidden sm:inline">{FREQ_LABELS[item.frequency]}</span>
                                <button
                                  onClick={() => removeItem(item.id)}
                                  className="text-slate-300 hover:text-harbor-red transition-colors"
                                >
                                  ✕
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Totals summary */}
                {lineItems.length > 0 && (
                  <div className="border-t border-slate-100 pt-3 flex gap-6 justify-center">
                    <div className="text-center">
                      <p className="text-xs text-slate-400 uppercase tracking-wide">Waves</p>
                      <p className="text-harbor-green font-semibold">
                        +${waves.reduce((s, i) => s + i.defaultAmount, 0).toLocaleString()}
                        <span className="text-xs text-slate-400 font-normal ml-1">({waves.length})</span>
                      </p>
                    </div>
                    <div className="w-px bg-slate-100" />
                    <div className="text-center">
                      <p className="text-xs text-slate-400 uppercase tracking-wide">Ripples</p>
                      <p className="text-harbor-red font-semibold">
                        -${ripples.reduce((s, i) => s + i.defaultAmount, 0).toLocaleString()}
                        <span className="text-xs text-slate-400 font-normal ml-1">({ripples.length})</span>
                      </p>
                    </div>
                  </div>
                )}

                <p className="text-xs text-slate-400 text-center">
                  You can always edit or add more from Settings.
                </p>
              </>
            )}

          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between pt-2">
            {step > 1 ? (
              <button
                onClick={goBack}
                className="px-5 py-2.5 rounded-xl border-2 border-slate-200 text-slate-600 font-medium hover:border-slate-300 transition-colors"
              >
                ← Back
              </button>
            ) : (
              <div />
            )}

            {step < TOTAL_STEPS ? (
              <button
                onClick={goNext}
                disabled={step === 1 && !checkingBalance}
                className="px-6 py-2.5 rounded-xl bg-harbor-navy text-white font-semibold hover:bg-harbor-navy/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors ml-auto"
              >
                Next →
              </button>
            ) : (
              <button
                onClick={finish}
                className="px-8 py-2.5 rounded-xl bg-harbor-green text-white font-semibold hover:bg-[#24b047] transition-colors ml-auto"
              >
                Set Sail ⚓
              </button>
            )}
          </div>

        </div>
      </div>

      <style>{`
        @keyframes stepFadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </main>
  );
}
