"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { loadSettings, saveSettings, saveAmounts, saveMonthBalances } from "../lib/storage";
import { SEED_DATA } from "../data/seedData";
import { AppSettings, LineItem, PaymentMethod, FrequencyType } from "../setup/page";

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

const BLANK_ITEM: EditingItem = {
  category: "",
  name: "",
  defaultAmount: 0,
  paymentMethod: "checking",
  isIncome: false,
  frequency: "every-week",
  anchorDate: undefined,
  anchorMonth: undefined,
};

export default function Settings() {
  const router = useRouter();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [activeTab, setActiveTab] = useState<"items" | "categories" | "cards">("items");
  const [activeCat, setActiveCat] = useState<string>("");
  const [editingItem, setEditingItem] = useState<EditingItem | null>(null);
  const [newCat, setNewCat] = useState("");
  const [newCardLabel, setNewCardLabel] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const s = loadSettings();
    if (!s) { router.push("/setup"); return; }
    setSettings(s);
    setActiveCat(s.categories[0] ?? "");
  }, []);

  function persist(updated: AppSettings) {
    setSettings(updated);
    saveSettings(updated);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function loadDemoData() {
    if (!confirm("This will replace all current settings, categories, and line items with the demo data set. Continue?")) return;
    saveSettings(SEED_DATA);
    saveAmounts({});
    saveMonthBalances({});
    setSettings(SEED_DATA);
    setActiveCat(SEED_DATA.categories[0] ?? "");
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  // ── Line Items ─────────────────────────────────────────────────────────────
  function startAdd() {
    setEditingItem({ ...BLANK_ITEM, category: activeCat });
  }

  function startEdit(item: LineItem) {
    setEditingItem({ ...item });
  }

  function cancelEdit() {
    setEditingItem(null);
  }

  function saveItem() {
    if (!settings || !editingItem || !editingItem.name.trim()) return;

    let updatedItems: LineItem[];

    if (editingItem.id) {
      // Edit existing
      updatedItems = settings.lineItems.map((i) =>
        i.id === editingItem.id ? { ...(editingItem as LineItem) } : i
      );
    } else {
      // Add new
      const newItem: LineItem = { ...editingItem, id: uid(), category: activeCat, anchorDate: editingItem.anchorDate || undefined };
      updatedItems = [...settings.lineItems, newItem];
    }

    persist({ ...settings, lineItems: updatedItems });
    setEditingItem(null);
  }

  function deleteItem(id: string) {
    if (!settings) return;
    if (!confirm("Delete this item?")) return;
    persist({ ...settings, lineItems: settings.lineItems.filter((i) => i.id !== id) });
  }

  // ── Categories ─────────────────────────────────────────────────────────────
  function addCategory() {
    if (!settings || !newCat.trim() || settings.categories.includes(newCat.trim())) return;
    persist({ ...settings, categories: [...settings.categories, newCat.trim()] });
    setNewCat("");
  }

  function removeCategory(cat: string) {
    if (!settings) return;
    const hasItems = settings.lineItems.some((i) => i.category === cat);
    if (hasItems && !confirm(`"${cat}" has line items. Delete category and all its items?`)) return;
    persist({
      ...settings,
      categories: settings.categories.filter((c) => c !== cat),
      lineItems: settings.lineItems.filter((i) => i.category !== cat),
    });
    if (activeCat === cat) setActiveCat(settings.categories[0] ?? "");
  }

  function addDefaultCategory(cat: string) {
    if (!settings || settings.categories.includes(cat)) return;
    persist({ ...settings, categories: [...settings.categories, cat] });
  }

  // ── Credit Cards ────────────────────────────────────────────────────────────
  function addCard() {
    if (!settings || !newCardLabel.trim() || settings.creditCards.length >= 3) return;
    const id = `credit-${settings.creditCards.length + 1}` as PaymentMethod;
    persist({ ...settings, creditCards: [...settings.creditCards, { id, label: newCardLabel.trim() }] });
    setNewCardLabel("");
  }

  function removeCard(id: PaymentMethod) {
    if (!settings) return;
    if (!confirm("Remove this card? Items assigned to it will switch to checking.")) return;
    const updatedItems = settings.lineItems.map((i) =>
      i.paymentMethod === id ? { ...i, paymentMethod: "checking" as PaymentMethod } : i
    );
    persist({
      ...settings,
      creditCards: settings.creditCards.filter((c) => c.id !== id),
      lineItems: updatedItems,
    });
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

  const catItems = settings.lineItems.filter((i) => i.category === activeCat);
  const unusedDefaults = DEFAULT_CATEGORIES.filter((c) => !settings.categories.includes(c));

  return (
    <main className="flex-1 bg-harbor-offwhite p-4">
      <div className="max-w-4xl mx-auto space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between bg-white rounded-2xl p-4 shadow-sm border border-harbor-teal-light">
          <div>
            <h1 className="text-2xl font-bold text-harbor-navy">Settings</h1>
            <p className="text-sm text-slate-500">Manage your budget setup</p>
          </div>
          <div className="flex items-center gap-3">
            {saved && (
              <span className="text-harbor-green text-sm font-medium">Saved</span>
            )}
            <button
              onClick={loadDemoData}
              className="px-3 py-1.5 text-xs border-2 border-dashed border-slate-200 text-slate-500 rounded-lg hover:border-harbor-teal hover:text-harbor-teal transition-colors"
            >
              Load Demo Data
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2">
          {(["items", "categories", "cards"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-2 rounded-xl text-sm font-medium capitalize transition-all
                ${activeTab === tab
                  ? "bg-harbor-navy text-white"
                  : "bg-white text-slate-600 hover:bg-harbor-teal-light shadow-sm border border-harbor-teal-light"}`}
            >
              {tab === "items" ? "Waves & Ripples" : tab === "categories" ? "Categories" : "Credit Cards"}
            </button>
          ))}
        </div>

        {/* ── TAB: Line Items ── */}
        {activeTab === "items" && (
          <div className="bg-white rounded-2xl shadow-sm border border-harbor-teal-light p-5 space-y-4">

            {/* Category selector */}
            <div className="flex flex-wrap gap-2">
              {settings.categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => { setActiveCat(cat); setEditingItem(null); }}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium border-2 transition-all
                    ${activeCat === cat
                      ? "bg-harbor-teal text-white border-harbor-teal"
                      : "bg-white text-slate-600 border-slate-200 hover:border-harbor-teal hover:text-harbor-teal"}`}
                >
                  {cat}
                  <span className="ml-1.5 text-xs opacity-60">
                    {settings.lineItems.filter((i) => i.category === cat).length}
                  </span>
                </button>
              ))}
            </div>

            {/* Item list */}
            <div className="space-y-2">
              {catItems.length === 0 && (
                <p className="text-sm text-slate-400 italic text-center py-4">No items in this category yet.</p>
              )}
              {catItems.map((item) => (
                <div key={item.id} className="flex items-center justify-between bg-harbor-offwhite rounded-xl px-4 py-3 border border-harbor-teal-light">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{item.name}</span>
                      {item.isIncome
                        ? <span className="text-xs bg-harbor-green/15 text-harbor-green px-2 py-0.5 rounded-full font-medium">Wave</span>
                        : <span className="text-xs bg-harbor-red/10 text-harbor-red px-2 py-0.5 rounded-full font-medium">Ripple</span>}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      ${item.defaultAmount} · {FREQ_LABELS[item.frequency]} · {
                        item.paymentMethod === "checking" ? "Checking" :
                        `${settings.creditCards.find(c => c.id === item.paymentMethod)?.label ?? item.paymentMethod}`
                      }
                    </div>
                  </div>
                  <div className="flex gap-2 ml-4">
                    <button
                      onClick={() => startEdit(item)}
                      className="px-3 py-1 text-xs bg-harbor-teal/10 text-harbor-teal rounded-lg hover:bg-harbor-teal/20 font-medium"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => deleteItem(item.id)}
                      className="px-3 py-1 text-xs bg-harbor-red/10 text-harbor-red rounded-lg hover:bg-harbor-red/20 font-medium"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Edit / Add form */}
            {editingItem ? (
              <div className="border-2 border-harbor-teal/30 rounded-2xl p-4 space-y-3 bg-harbor-teal-light">
                <h3 className="font-semibold text-harbor-navy">
                  {editingItem.id ? "Edit Item" : "Add New Item"}
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="text-xs text-slate-500 block mb-1">Name</label>
                    <input
                      className="w-full border-2 border-white rounded-xl px-3 py-2 focus:outline-none focus:border-harbor-teal bg-white"
                      value={editingItem.name}
                      onChange={(e) => setEditingItem((p) => p && ({ ...p, name: e.target.value }))}
                      placeholder="Item name"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 block mb-1">Default Amount</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                      <input
                        type="number"
                        className="w-full border-2 border-white rounded-xl pl-7 pr-3 py-2 focus:outline-none focus:border-harbor-teal bg-white"
                        value={editingItem.defaultAmount}
                        onChange={(e) => setEditingItem((p) => p && ({ ...p, defaultAmount: Number(e.target.value) }))}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 block mb-1">Type</label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setEditingItem((p) => p && ({ ...p, isIncome: false }))}
                        className={`flex-1 py-2 rounded-xl text-sm font-medium border-2 ${!editingItem.isIncome ? "bg-harbor-red/10 border-harbor-red/50 text-harbor-red" : "bg-white border-slate-200 text-slate-500"}`}
                      >
                        Ripple
                      </button>
                      <button
                        onClick={() => setEditingItem((p) => p && ({ ...p, isIncome: true }))}
                        className={`flex-1 py-2 rounded-xl text-sm font-medium border-2 ${editingItem.isIncome ? "bg-harbor-green/10 border-harbor-green/50 text-harbor-green" : "bg-white border-slate-200 text-slate-500"}`}
                      >
                        Wave
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 block mb-1">Payment Method</label>
                    <select
                      className="w-full border-2 border-white rounded-xl px-3 py-2 focus:outline-none focus:border-harbor-teal bg-white"
                      value={editingItem.paymentMethod}
                      onChange={(e) => setEditingItem((p) => p && ({ ...p, paymentMethod: e.target.value as PaymentMethod }))}
                    >
                      {cardOptions.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 block mb-1">Frequency</label>
                    <select
                      className="w-full border-2 border-white rounded-xl px-3 py-2 focus:outline-none focus:border-harbor-teal bg-white"
                      value={editingItem.frequency}
                      onChange={(e) => setEditingItem((p) => p && ({ ...p, frequency: e.target.value as FrequencyType }))}
                    >
                      {Object.entries(FREQ_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                  </div>
                  {(editingItem.frequency === "every-other-week" ||
                    editingItem.frequency === "biweekly-odd" ||
                    editingItem.frequency === "biweekly-even") && (
                    <div className="col-span-2">
                      <label className="text-xs text-slate-500 block mb-1">
                        Anchor Date — a Friday this item is paid on
                      </label>
                      <input
                        type="date"
                        className="w-full border-2 border-white rounded-xl px-3 py-2 focus:outline-none focus:border-harbor-teal bg-white"
                        value={editingItem.anchorDate ?? ""}
                        onChange={(e) => setEditingItem((p) => p && ({ ...p, anchorDate: e.target.value || undefined }))}
                      />
                      <p className="text-xs text-slate-400 mt-1">e.g. 2026-03-06 for the Mar 6 pay cycle</p>
                    </div>
                  )}
                  {(editingItem.frequency === "quarterly" || editingItem.frequency === "annually") && (
                    <div className="col-span-2">
                      <label className="text-xs text-slate-500 block mb-1">Starting Month</label>
                      <select
                        className="w-full border-2 border-white rounded-xl px-3 py-2 focus:outline-none focus:border-harbor-teal bg-white"
                        value={editingItem.anchorMonth ?? 1}
                        onChange={(e) => setEditingItem((p) => p && ({ ...p, anchorMonth: Number(e.target.value) }))}
                      >
                        {["January","February","March","April","May","June","July","August","September","October","November","December"].map((m, i) => (
                          <option key={i + 1} value={i + 1}>{m}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
                <div className="flex gap-2 pt-1">
                  <button onClick={saveItem} className="px-5 py-2 bg-harbor-teal text-white rounded-xl hover:bg-[#22857a] font-medium text-sm transition-colors">
                    {editingItem.id ? "Save Changes" : "Add Item"}
                  </button>
                  <button onClick={cancelEdit} className="px-5 py-2 bg-white border-2 border-slate-200 rounded-xl text-slate-600 hover:border-harbor-teal text-sm transition-colors">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={startAdd}
                className="w-full py-2 border-2 border-dashed border-slate-200 rounded-xl text-slate-500 hover:border-harbor-teal hover:text-harbor-teal text-sm font-medium transition-all"
              >
                + Add item to {activeCat}
              </button>
            )}
          </div>
        )}

        {/* ── TAB: Categories ── */}
        {activeTab === "categories" && (
          <div className="bg-white rounded-2xl shadow-sm border border-harbor-teal-light p-5 space-y-4">
            <h2 className="font-semibold text-harbor-navy">Your Categories</h2>
            <div className="space-y-2">
              {settings.categories.map((cat) => (
                <div key={cat} className="flex items-center justify-between bg-harbor-offwhite rounded-xl px-4 py-3 border border-harbor-teal-light">
                  <span className="font-medium text-sm">{cat}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-400">
                      {settings.lineItems.filter((i) => i.category === cat).length} items
                    </span>
                    <button
                      onClick={() => removeCategory(cat)}
                      className="px-3 py-1 text-xs bg-harbor-red/10 text-harbor-red rounded-lg hover:bg-harbor-red/20 font-medium"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <input
                className="flex-1 border-2 border-harbor-teal-light rounded-xl px-4 py-2 focus:outline-none focus:border-harbor-teal"
                placeholder="New category name..."
                value={newCat}
                onChange={(e) => setNewCat(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addCategory()}
              />
              <button onClick={addCategory} className="px-4 py-2 bg-harbor-teal text-white rounded-xl hover:bg-[#22857a] transition-colors">
                Add
              </button>
            </div>

            {unusedDefaults.length > 0 && (
              <div>
                <p className="text-xs text-slate-400 mb-2">Quick add from defaults:</p>
                <div className="flex flex-wrap gap-2">
                  {unusedDefaults.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => addDefaultCategory(cat)}
                      className="px-3 py-1.5 rounded-full text-sm border-2 border-dashed border-slate-200 text-slate-500 hover:border-harbor-teal hover:text-harbor-teal transition-colors"
                    >
                      + {cat}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── TAB: Credit Cards ── */}
        {activeTab === "cards" && (
          <div className="bg-white rounded-2xl shadow-sm border border-harbor-teal-light p-5 space-y-4">
            <h2 className="font-semibold text-harbor-navy">Credit Cards</h2>
            {settings.creditCards.length === 0 && (
              <p className="text-sm text-slate-400 italic">No credit cards added.</p>
            )}
            <div className="space-y-2">
              {settings.creditCards.map((card) => (
                <div key={card.id} className="flex items-center justify-between bg-harbor-offwhite rounded-xl px-4 py-3 border border-harbor-teal-light">
                  <span className="font-medium">{card.label}</span>
                  <button
                    onClick={() => removeCard(card.id)}
                    className="px-3 py-1 text-xs bg-harbor-red/10 text-harbor-red rounded-lg hover:bg-harbor-red/20 font-medium"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
            {settings.creditCards.length < 3 && (
              <div className="flex gap-2">
                <input
                  className="flex-1 border-2 border-harbor-teal-light rounded-xl px-4 py-2 focus:outline-none focus:border-harbor-teal"
                  placeholder="Card name (e.g. Capital One)"
                  value={newCardLabel}
                  onChange={(e) => setNewCardLabel(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addCard()}
                />
                <button onClick={addCard} className="px-4 py-2 bg-harbor-teal text-white rounded-xl hover:bg-[#22857a] transition-colors">
                  Add
                </button>
              </div>
            )}
            {settings.creditCards.length >= 3 && (
              <p className="text-xs text-slate-400">Maximum of 3 credit cards reached.</p>
            )}
          </div>
        )}

      </div>
    </main>
  );
}
