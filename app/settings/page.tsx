"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { loadSettings, saveSettings, saveAmounts, saveMonthBalances } from "../lib/storage";
import { SEED_DATA } from "../data/seedData";
import { AppSettings, FrequencyType, LineItem, PaymentMethod } from "../lib/types";

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

type EditingItem = Omit<LineItem, "id"> & { id?: string };

function blankItem(isIncome: boolean, category: string): EditingItem {
  return { category, name: "", defaultAmount: 0, paymentMethod: "checking", isIncome, frequency: "every-week" };
}

// ── Inline item form ──────────────────────────────────────────────────────────
function ItemForm({
  item, categories, cardOptions, onSave, onCancel, isIncome,
}: {
  item: EditingItem;
  categories: string[];
  cardOptions: { value: PaymentMethod; label: string }[];
  onSave: (item: EditingItem) => void;
  onCancel: () => void;
  isIncome: boolean;
}) {
  const [form, setForm] = useState<EditingItem>(item);
  const accentColor = isIncome ? "harbor-green" : "harbor-red";

  return (
    <div className={`border-2 rounded-2xl p-4 space-y-3 ${isIncome ? "border-harbor-green/20 bg-harbor-green/5" : "border-harbor-red/20 bg-harbor-red/5"}`}>
      <h3 className="font-semibold text-harbor-navy text-sm">
        {form.id ? `Edit ${isIncome ? "Wave" : "Ripple"}` : `New ${isIncome ? "Wave" : "Ripple"}`}
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:sm:col-span-2">
          <label className="text-xs text-slate-500 block mb-1">Name</label>
          <input
            autoFocus
            className="w-full border-2 border-white rounded-xl px-3 py-2 focus:outline-none focus:border-harbor-teal bg-white text-sm"
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            placeholder={isIncome ? "e.g. Paycheck A" : "e.g. Rent"}
          />
        </div>
        <div>
          <label className="text-xs text-slate-500 block mb-1">Default Amount</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
            <input
              type="number"
              inputMode="decimal"
              className="w-full border-2 border-white rounded-xl pl-7 pr-3 py-2 focus:outline-none focus:border-harbor-teal bg-white text-sm"
              value={form.defaultAmount}
              onChange={(e) => setForm((p) => ({ ...p, defaultAmount: Number(e.target.value) }))}
            />
          </div>
        </div>
        <div>
          <label className="text-xs text-slate-500 block mb-1">Category</label>
          <select
            className="w-full border-2 border-white rounded-xl px-3 py-2 focus:outline-none focus:border-harbor-teal bg-white text-sm"
            value={form.category}
            onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
          >
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        {!isIncome && (
          <div>
            <label className="text-xs text-slate-500 block mb-1">Payment Method</label>
            <select
              className="w-full border-2 border-white rounded-xl px-3 py-2 focus:outline-none focus:border-harbor-teal bg-white text-sm"
              value={form.paymentMethod}
              onChange={(e) => setForm((p) => ({ ...p, paymentMethod: e.target.value as PaymentMethod }))}
            >
              {cardOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        )}
        <div className={isIncome ? "sm:col-span-2" : ""}>
          <label className="text-xs text-slate-500 block mb-1">Frequency</label>
          <select
            className="w-full border-2 border-white rounded-xl px-3 py-2 focus:outline-none focus:border-harbor-teal bg-white text-sm"
            value={form.frequency}
            onChange={(e) => setForm((p) => ({ ...p, frequency: e.target.value as FrequencyType }))}
          >
            {Object.entries(FREQ_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        {(form.frequency === "every-other-week" || form.frequency === "biweekly-odd" || form.frequency === "biweekly-even") && (
          <div className="sm:col-span-2">
            <label className="text-xs text-slate-500 block mb-1">Anchor Date — a Friday this item is paid on</label>
            <input
              type="date"
              className="w-full border-2 border-white rounded-xl px-3 py-2 focus:outline-none focus:border-harbor-teal bg-white text-sm"
              value={form.anchorDate ?? ""}
              onChange={(e) => setForm((p) => ({ ...p, anchorDate: e.target.value || undefined }))}
            />
            <p className="text-xs text-slate-400 mt-1">e.g. 2026-03-06 for the Mar 6 pay cycle</p>
          </div>
        )}
        {(form.frequency === "quarterly" || form.frequency === "annually") && (
          <div className="sm:col-span-2">
            <label className="text-xs text-slate-500 block mb-1">Starting Month</label>
            <select
              className="w-full border-2 border-white rounded-xl px-3 py-2 focus:outline-none focus:border-harbor-teal bg-white text-sm"
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
      <div className="flex gap-2 pt-1">
        <button
          onClick={() => onSave(form)}
          className={`px-5 py-2 text-white rounded-xl font-medium text-sm transition-colors ${isIncome ? "bg-harbor-green hover:bg-harbor-green/90" : "bg-harbor-red hover:bg-harbor-red/90"}`}
        >
          {form.id ? "Save Changes" : `Add ${isIncome ? "Wave" : "Ripple"}`}
        </button>
        <button
          onClick={onCancel}
          className="px-5 py-2 bg-white border-2 border-slate-200 rounded-xl text-slate-600 hover:border-harbor-teal text-sm transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Section header component ──────────────────────────────────────────────────
function SectionHeader({ icon, title, subtitle, count, action }: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  count?: number;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-harbor-teal-light flex items-center justify-center flex-shrink-0">
          {icon}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-bold text-harbor-navy text-base">{title}</h2>
            {count !== undefined && (
              <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-medium">{count}</span>
            )}
          </div>
          <p className="text-harbor-navy/50 text-xs mt-0.5">{subtitle}</p>
        </div>
      </div>
      {action}
    </div>
  );
}

// ── Main Settings Page ────────────────────────────────────────────────────────
export default function Settings() {
  const router = useRouter();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [saved, setSaved] = useState(false);

  // Separate editing state per section
  const [wavesForm, setWavesForm] = useState<EditingItem | null>(null);
  const [ripplesForm, setRipplesForm] = useState<EditingItem | null>(null);

  // Category filters per section
  const [wavesCat, setWavesCat] = useState<string>("all");
  const [ripplesCat, setRipplesCat] = useState<string>("all");

  // New category / card
  const [newCat, setNewCat] = useState("");
  const [newCardLabel, setNewCardLabel] = useState("");

  // Section refs for deep-link scrolling
  const wavesRef = useRef<HTMLDivElement>(null);
  const ripplesRef = useRef<HTMLDivElement>(null);
  const fleetRef = useRef<HTMLDivElement>(null);
  const categoriesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const s = loadSettings();
    if (!s) { router.push("/setup"); return; }
    setSettings(s);

    // Deep-link: scroll to section and auto-open form
    const hash = window.location.hash;
    if (hash === "#waves") {
      setTimeout(() => {
        wavesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        setWavesForm(blankItem(true, s.categories[0] ?? ""));
      }, 150);
    } else if (hash === "#ripples") {
      setTimeout(() => {
        ripplesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        setRipplesForm(blankItem(false, s.categories[0] ?? ""));
      }, 150);
    } else if (hash === "#fleet") {
      setTimeout(() => fleetRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 150);
    }
  }, []);

  function persist(updated: AppSettings) {
    setSettings(updated);
    saveSettings(updated);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function loadDemoData() {
    if (!confirm("This will replace all current settings with demo data. Continue?")) return;
    saveSettings(SEED_DATA);
    saveAmounts({});
    saveMonthBalances({});
    setSettings(SEED_DATA);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  // ── Item CRUD ────────────────────────────────────────────────────────────────
  function saveItem(form: EditingItem) {
    if (!settings || !form.name.trim()) return;
    let updatedItems: LineItem[];
    if (form.id) {
      updatedItems = settings.lineItems.map((i) => i.id === form.id ? { ...(form as LineItem) } : i);
    } else {
      updatedItems = [...settings.lineItems, { ...form, id: uid(), anchorDate: form.anchorDate || undefined }];
    }
    persist({ ...settings, lineItems: updatedItems });
    setWavesForm(null);
    setRipplesForm(null);
  }

  function deleteItem(id: string) {
    if (!settings || !confirm("Delete this item?")) return;
    persist({ ...settings, lineItems: settings.lineItems.filter((i) => i.id !== id) });
  }

  // ── Categories ────────────────────────────────────────────────────────────────
  function addCategory() {
    if (!settings || !newCat.trim() || settings.categories.includes(newCat.trim())) return;
    persist({ ...settings, categories: [...settings.categories, newCat.trim()] });
    setNewCat("");
  }

  function removeCategory(cat: string) {
    if (!settings) return;
    const hasItems = settings.lineItems.some((i) => i.category === cat);
    if (hasItems && !confirm(`"${cat}" has items. Delete category and all its items?`)) return;
    persist({
      ...settings,
      categories: settings.categories.filter((c) => c !== cat),
      lineItems: settings.lineItems.filter((i) => i.category !== cat),
    });
  }

  // ── Fleet (Credit Cards) ──────────────────────────────────────────────────────
  function addCard() {
    if (!settings || !newCardLabel.trim() || settings.creditCards.length >= 3) return;
    const id = `credit-${settings.creditCards.length + 1}` as PaymentMethod;
    persist({ ...settings, creditCards: [...settings.creditCards, { id, label: newCardLabel.trim() }] });
    setNewCardLabel("");
  }

  function removeCard(id: PaymentMethod) {
    if (!settings || !confirm("Remove this vessel? Items assigned to it will switch to checking.")) return;
    const updatedItems = settings.lineItems.map((i) =>
      i.paymentMethod === id ? { ...i, paymentMethod: "checking" as PaymentMethod } : i
    );
    persist({ ...settings, creditCards: settings.creditCards.filter((c) => c.id !== id), lineItems: updatedItems });
  }

  if (!settings) return (
    <main className="flex-1 bg-harbor-offwhite flex items-center justify-center">
      <p className="text-harbor-navy/50">Loading...</p>
    </main>
  );

  const cardOptions: { value: PaymentMethod; label: string }[] = [
    { value: "checking", label: "Checking" },
    ...settings.creditCards.map((c) => ({ value: c.id, label: c.label })),
  ];

  const unusedDefaults = DEFAULT_CATEGORIES.filter((c) => !settings.categories.includes(c));

  const waves = settings.lineItems.filter((i) => i.isIncome);
  const ripples = settings.lineItems.filter((i) => !i.isIncome);

  const waveCategories = ["all", ...Array.from(new Set(waves.map((i) => i.category)))];
  const rippleCategories = ["all", ...Array.from(new Set(ripples.map((i) => i.category)))];

  const visibleWaves = wavesCat === "all" ? waves : waves.filter((i) => i.category === wavesCat);
  const visibleRipples = ripplesCat === "all" ? ripples : ripples.filter((i) => i.category === ripplesCat);

  return (
    <main className="flex-1 bg-harbor-offwhite">
      <div className="max-w-[1280px] mx-auto px-4 md:px-8 py-6 space-y-5">

        {/* ── Page header ── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-harbor-navy">Chart Room</h1>
            <p className="text-harbor-navy/50 text-sm mt-0.5">Configure your Harbor setup</p>
          </div>
          <div className="flex items-center gap-3">
            {saved && (
              <span className="flex items-center gap-1.5 text-harbor-green text-sm font-medium">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                Saved
              </span>
            )}
            <button
              onClick={loadDemoData}
              className="px-3 py-1.5 text-xs border-2 border-dashed border-slate-200 text-slate-500 rounded-lg hover:border-harbor-teal hover:text-harbor-teal transition-colors"
            >
              Load Demo Data
            </button>
          </div>
        </div>

        {/* ── Waves ── */}
        <div ref={wavesRef} id="waves" className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 scroll-mt-32">
          <SectionHeader
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2A9D8F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
                <polyline points="17 6 23 6 23 12"/>
              </svg>
            }
            title="Waves"
            subtitle="Your income streams"
            count={waves.length}
            action={
              !wavesForm && (
                <button
                  onClick={() => setWavesForm(blankItem(true, settings.categories[0] ?? ""))}
                  className="flex items-center gap-1.5 px-4 py-2 bg-harbor-green text-white rounded-lg text-sm font-medium hover:bg-harbor-green/90 transition-colors"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                  Add Wave
                </button>
              )
            }
          />

          {/* Category filter */}
          {waveCategories.length > 2 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {waveCategories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setWavesCat(cat)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all capitalize ${
                    wavesCat === cat
                      ? "bg-harbor-green text-white border-harbor-green"
                      : "bg-white text-slate-500 border-slate-200 hover:border-harbor-green hover:text-harbor-green"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}

          <div className="space-y-2 mb-3">
            {visibleWaves.length === 0 && !wavesForm && (
              <p className="text-sm text-slate-400 italic text-center py-6">No waves yet — add your income streams above.</p>
            )}
            {visibleWaves.map((item) => (
              <div key={item.id} className="flex items-start justify-between gap-3 bg-harbor-offwhite rounded-xl px-4 py-3 border border-slate-100">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm text-harbor-navy">{item.name}</span>
                    <span className="text-xs bg-harbor-green/10 text-harbor-green px-2 py-0.5 rounded-full font-medium">Wave</span>
                    <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{item.category}</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    ${item.defaultAmount.toLocaleString()} · {FREQ_LABELS[item.frequency]}
                  </p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => { setWavesForm({ ...item }); setRipplesForm(null); }}
                    className="px-3 py-2 text-xs bg-harbor-teal/10 text-harbor-teal rounded-lg hover:bg-harbor-teal/20 font-medium"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => deleteItem(item.id)}
                    className="px-3 py-2 text-xs bg-harbor-red/10 text-harbor-red rounded-lg hover:bg-harbor-red/20 font-medium"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>

          {wavesForm && (
            <ItemForm
              item={wavesForm}
              categories={settings.categories}
              cardOptions={cardOptions}
              isIncome={true}
              onSave={saveItem}
              onCancel={() => setWavesForm(null)}
            />
          )}
        </div>

        {/* ── Ripples ── */}
        <div ref={ripplesRef} id="ripples" className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 scroll-mt-32">
          <SectionHeader
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#E63946" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/>
                <polyline points="17 18 23 18 23 12"/>
              </svg>
            }
            title="Ripples"
            subtitle="Your expenses"
            count={ripples.length}
            action={
              !ripplesForm && (
                <button
                  onClick={() => setRipplesForm(blankItem(false, settings.categories[0] ?? ""))}
                  className="flex items-center gap-1.5 px-4 py-2 bg-harbor-red text-white rounded-lg text-sm font-medium hover:bg-harbor-red/90 transition-colors"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                  Add Ripple
                </button>
              )
            }
          />

          {/* Category filter */}
          {rippleCategories.length > 2 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {rippleCategories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setRipplesCat(cat)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all capitalize ${
                    ripplesCat === cat
                      ? "bg-harbor-red text-white border-harbor-red"
                      : "bg-white text-slate-500 border-slate-200 hover:border-harbor-red hover:text-harbor-red"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}

          <div className="space-y-2 mb-3">
            {visibleRipples.length === 0 && !ripplesForm && (
              <p className="text-sm text-slate-400 italic text-center py-6">No ripples yet — add your expenses above.</p>
            )}
            {visibleRipples.map((item) => (
              <div key={item.id} className="flex items-start justify-between gap-3 bg-harbor-offwhite rounded-xl px-4 py-3 border border-slate-100">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm text-harbor-navy">{item.name}</span>
                    <span className="text-xs bg-harbor-red/10 text-harbor-red px-2 py-0.5 rounded-full font-medium">Ripple</span>
                    <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{item.category}</span>
                    {item.paymentMethod !== "checking" && (
                      <span className="text-xs text-harbor-navy/60 bg-harbor-navy/10 px-2 py-0.5 rounded-full">
                        {settings.creditCards.find((c) => c.id === item.paymentMethod)?.label ?? item.paymentMethod}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    ${item.defaultAmount.toLocaleString()} · {FREQ_LABELS[item.frequency]}
                    {item.paymentMethod === "checking" && " · Checking"}
                  </p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => { setRipplesForm({ ...item }); setWavesForm(null); }}
                    className="px-3 py-2 text-xs bg-harbor-teal/10 text-harbor-teal rounded-lg hover:bg-harbor-teal/20 font-medium"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => deleteItem(item.id)}
                    className="px-3 py-2 text-xs bg-harbor-red/10 text-harbor-red rounded-lg hover:bg-harbor-red/20 font-medium"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>

          {ripplesForm && (
            <ItemForm
              item={ripplesForm}
              categories={settings.categories}
              cardOptions={cardOptions}
              isIncome={false}
              onSave={saveItem}
              onCancel={() => setRipplesForm(null)}
            />
          )}
        </div>

        {/* ── Chart Positions (Categories) ── */}
        <div ref={categoriesRef} id="categories" className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 scroll-mt-32">
          <SectionHeader
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2A9D8F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            }
            title="Chart Positions"
            subtitle="Organize your budget into categories"
            count={settings.categories.length}
          />

          <div className="space-y-2 mb-4">
            {settings.categories.map((cat) => (
              <div key={cat} className="flex items-center justify-between bg-harbor-offwhite rounded-xl px-4 py-3 border border-slate-100">
                <div>
                  <span className="font-medium text-sm text-harbor-navy">{cat}</span>
                  <span className="ml-2 text-xs text-slate-400">
                    {settings.lineItems.filter((i) => i.category === cat).length} items
                  </span>
                </div>
                <button
                  onClick={() => removeCategory(cat)}
                  className="px-3 py-1.5 text-xs bg-harbor-red/10 text-harbor-red rounded-lg hover:bg-harbor-red/20 font-medium"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>

          <div className="flex gap-2 mb-4">
            <input
              className="flex-1 border-2 border-slate-100 rounded-xl px-4 py-2 focus:outline-none focus:border-harbor-teal text-sm"
              placeholder="New category name..."
              value={newCat}
              onChange={(e) => setNewCat(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addCategory()}
            />
            <button onClick={addCategory} className="px-4 py-2 bg-harbor-teal text-white rounded-xl hover:bg-harbor-teal/90 transition-colors text-sm font-medium">
              Add
            </button>
          </div>

          {unusedDefaults.length > 0 && (
            <div>
              <p className="text-xs text-slate-400 mb-2">Quick-add defaults:</p>
              <div className="flex flex-wrap gap-2">
                {unusedDefaults.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => {
                      if (!settings.categories.includes(cat)) persist({ ...settings, categories: [...settings.categories, cat] });
                    }}
                    className="px-3 py-1.5 rounded-full text-xs border-2 border-dashed border-slate-200 text-slate-500 hover:border-harbor-teal hover:text-harbor-teal transition-colors"
                  >
                    + {cat}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Your Fleet (Credit Cards) ── */}
        <div ref={fleetRef} id="fleet" className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 scroll-mt-32">
          <SectionHeader
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2A9D8F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="5" r="3"/>
                <line x1="12" y1="8" x2="12" y2="21"/>
                <path d="M5 15l7 6 7-6"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
            }
            title="Your Fleet"
            subtitle="Credit cards assigned to your ripples"
            count={settings.creditCards.length}
          />

          <div className="space-y-2 mb-4">
            {settings.creditCards.length === 0 && (
              <p className="text-sm text-slate-400 italic text-center py-4">No vessels in your fleet yet.</p>
            )}
            {settings.creditCards.map((card) => (
              <div key={card.id} className="flex items-center justify-between bg-harbor-offwhite rounded-xl px-4 py-3 border border-slate-100">
                <div className="flex items-center gap-3">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
                    <line x1="1" y1="10" x2="23" y2="10"/>
                  </svg>
                  <span className="font-medium text-sm text-harbor-navy">{card.label}</span>
                </div>
                <button
                  onClick={() => removeCard(card.id)}
                  className="px-3 py-1.5 text-xs bg-harbor-red/10 text-harbor-red rounded-lg hover:bg-harbor-red/20 font-medium"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>

          {settings.creditCards.length < 3 ? (
            <div className="flex gap-2">
              <input
                className="flex-1 border-2 border-slate-100 rounded-xl px-4 py-2 focus:outline-none focus:border-harbor-teal text-sm"
                placeholder="Vessel name (e.g. Capital One)"
                value={newCardLabel}
                onChange={(e) => setNewCardLabel(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addCard()}
              />
              <button onClick={addCard} className="px-4 py-2 bg-harbor-navy text-white rounded-xl hover:bg-harbor-navy/90 transition-colors text-sm font-medium">
                Add Vessel
              </button>
            </div>
          ) : (
            <p className="text-xs text-slate-400">Maximum of 3 vessels reached.</p>
          )}
        </div>

      </div>
    </main>
  );
}
