"use client";

import { useState, useEffect } from "react";

// ── Types & Storage ───────────────────────────────────────────────────────────
type Buoy = {
  id: string;
  name: string;
  current: number;
  goal: number;
  autoSave?: number;     // amount to add each month
  autoSaveDay?: number;  // day of month (1–28)
  lastAutoSave?: string; // "YYYY-MM" — tracks when auto-save last ran
};

const BUOYS_KEY = "harbor_buoys";

function loadBuoys(): Buoy[] {
  try {
    const raw = localStorage.getItem(BUOYS_KEY);
    return raw ? (JSON.parse(raw) as Buoy[]) : [];
  } catch { return []; }
}

function saveBuoys(buoys: Buoy[]) {
  localStorage.setItem(BUOYS_KEY, JSON.stringify(buoys));
}

function formatMoney(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

// ── Blank form state ──────────────────────────────────────────────────────────
const BLANK: {
  name: string; current: string; goal: string;
  enableAutoSave: boolean; autoSave: string; autoSaveDay: string;
} = { name: "", current: "", goal: "", enableAutoSave: false, autoSave: "", autoSaveDay: "" };

// ── Modal ─────────────────────────────────────────────────────────────────────
function Modal({
  title, form, setForm, onSave, onClose,
}: {
  title: string;
  form: typeof BLANK;
  setForm: React.Dispatch<React.SetStateAction<typeof BLANK>>;
  onSave: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-auto flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <h2 className="text-harbor-navy font-bold text-lg">{title}</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-harbor-navy transition-colors p-1"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 flex flex-col gap-4">
          <div>
            <label className="text-harbor-navy/70 text-xs font-medium block mb-1.5">Buoy Name</label>
            <input
              type="text"
              placeholder="e.g. Emergency Fund"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-harbor-navy placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-harbor-teal/30"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-harbor-navy/70 text-xs font-medium block mb-1.5">Current Amount</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                <input
                  type="number"
                  inputMode="decimal"
                  placeholder="0"
                  min="0"
                  value={form.current}
                  onChange={(e) => setForm((f) => ({ ...f, current: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg pl-7 pr-3 py-2.5 text-sm text-harbor-navy placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-harbor-teal/30"
                />
              </div>
            </div>
            <div>
              <label className="text-harbor-navy/70 text-xs font-medium block mb-1.5">Goal Amount</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                <input
                  type="number"
                  inputMode="decimal"
                  placeholder="1000"
                  min="1"
                  value={form.goal}
                  onChange={(e) => setForm((f) => ({ ...f, goal: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg pl-7 pr-3 py-2.5 text-sm text-harbor-navy placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-harbor-teal/30"
                />
              </div>
            </div>
          </div>

          {/* Auto-save */}
          <div className="border border-slate-100 rounded-xl p-4 flex flex-col gap-3 bg-slate-50/60">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-harbor-navy text-sm font-medium">Auto-Save</p>
                <p className="text-harbor-navy/50 text-xs mt-0.5">Automatically add money on a set date</p>
              </div>
              {/* Toggle */}
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, enableAutoSave: !f.enableAutoSave }))}
                className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${
                  form.enableAutoSave ? "bg-harbor-teal" : "bg-slate-200"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${
                    form.enableAutoSave ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {form.enableAutoSave && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="text-harbor-navy/70 text-xs font-medium block mb-1.5">Amount / Month</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      placeholder="50"
                      min="1"
                      value={form.autoSave}
                      onChange={(e) => setForm((f) => ({ ...f, autoSave: e.target.value }))}
                      className="w-full border border-slate-200 rounded-lg pl-7 pr-3 py-2.5 text-sm text-harbor-navy placeholder:text-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-harbor-teal/30"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-harbor-navy/70 text-xs font-medium block mb-1.5">Day of Month</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    placeholder="1"
                    min="1"
                    max="28"
                    value={form.autoSaveDay}
                    onChange={(e) => setForm((f) => ({ ...f, autoSaveDay: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-harbor-navy placeholder:text-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-harbor-teal/30"
                  />
                  <p className="text-harbor-navy/40 text-xs mt-1">1–28</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 pb-5 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 border border-slate-200 rounded-lg text-sm font-medium text-harbor-navy/70 hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            className="flex-1 py-2.5 bg-harbor-teal text-white rounded-lg text-sm font-medium hover:bg-harbor-teal/90 transition-colors"
          >
            Save Buoy
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Delete confirm modal ──────────────────────────────────────────────────────
function DeleteModal({ name, onConfirm, onClose }: { name: string; onConfirm: () => void; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-auto p-6 flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#E63946" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
            </svg>
          </div>
          <div>
            <p className="text-harbor-navy font-bold text-base">Delete Buoy</p>
            <p className="text-harbor-navy/55 text-sm">Remove <span className="font-medium">{name}</span>?</p>
          </div>
        </div>
        <p className="text-harbor-navy/50 text-sm">This will permanently delete this savings goal and all progress. This cannot be undone.</p>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 border border-slate-200 rounded-lg text-sm font-medium text-harbor-navy/70 hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          <button onClick={onConfirm} className="flex-1 py-2.5 bg-harbor-red text-white rounded-lg text-sm font-medium hover:bg-harbor-red/90 transition-colors">
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Quick-add notification ────────────────────────────────────────────────────
function Toast({ message }: { message: string }) {
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-harbor-navy text-white text-sm px-4 py-2.5 rounded-full shadow-lg z-50 whitespace-nowrap">
      {message}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function BuoysPage() {
  const [buoys, setBuoys] = useState<Buoy[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<typeof BLANK>({ ...BLANK });

  // Delete confirm
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Toast
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const loaded = loadBuoys();
    // Apply auto-save for buoys whose day matches today and haven't run this month
    const today = new Date();
    const monthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
    const day = today.getDate();
    let changed = false;
    const updated = loaded.map((b) => {
      if (b.autoSave && b.autoSaveDay === day && b.lastAutoSave !== monthKey) {
        changed = true;
        return { ...b, current: b.current + b.autoSave, lastAutoSave: monthKey };
      }
      return b;
    });
    if (changed) saveBuoys(updated);
    setBuoys(updated);
    setLoaded(true);
  }, []);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  }

  // ── Open modal for new buoy ──
  function openNew() {
    setEditingId(null);
    setForm({ ...BLANK });
    setShowModal(true);
  }

  // ── Open modal to edit ──
  function openEdit(buoy: Buoy) {
    setEditingId(buoy.id);
    setForm({
      name: buoy.name,
      current: String(buoy.current),
      goal: String(buoy.goal),
      enableAutoSave: !!(buoy.autoSave && buoy.autoSaveDay),
      autoSave: buoy.autoSave ? String(buoy.autoSave) : "",
      autoSaveDay: buoy.autoSaveDay ? String(buoy.autoSaveDay) : "",
    });
    setShowModal(true);
  }

  // ── Save (create or update) ──
  function handleSave() {
    const name = form.name.trim();
    const current = parseFloat(form.current) || 0;
    const goal = parseFloat(form.goal) || 0;
    if (!name || goal <= 0) return;

    const autoSave = form.enableAutoSave ? (parseFloat(form.autoSave) || undefined) : undefined;
    const autoSaveDay = form.enableAutoSave ? (parseInt(form.autoSaveDay) || undefined) : undefined;

    let updated: Buoy[];
    if (editingId) {
      updated = buoys.map((b) =>
        b.id === editingId
          ? { ...b, name, current, goal, autoSave, autoSaveDay }
          : b
      );
    } else {
      const newBuoy: Buoy = { id: crypto.randomUUID(), name, current, goal, autoSave, autoSaveDay };
      updated = [...buoys, newBuoy];
    }

    saveBuoys(updated);
    setBuoys(updated);
    setShowModal(false);
    showToast(editingId ? "Buoy updated" : "New buoy created");
  }

  // ── Quick add ──
  function quickAdd(id: string, amount: number) {
    const updated = buoys.map((b) =>
      b.id === id ? { ...b, current: b.current + amount } : b
    );
    saveBuoys(updated);
    setBuoys(updated);
    showToast(`+${formatMoney(amount)} added`);
  }

  // ── Delete ──
  function handleDelete() {
    if (!deleteId) return;
    const updated = buoys.filter((b) => b.id !== deleteId);
    saveBuoys(updated);
    setBuoys(updated);
    setDeleteId(null);
    showToast("Buoy removed");
  }

  if (!loaded) {
    return (
      <div className="min-h-screen bg-harbor-offwhite flex items-center justify-center">
        <div className="text-harbor-navy/40 text-sm">Loading...</div>
      </div>
    );
  }

  const deleteTarget = buoys.find((b) => b.id === deleteId);

  return (
    <div className="min-h-screen bg-harbor-offwhite px-4 md:px-8 py-6 max-w-[1280px] mx-auto">

      {/* ── Page header ── */}
      <div className="flex items-start justify-between mb-7">
        <div>
          <h1 className="text-harbor-navy text-2xl font-bold">Savings Buoys</h1>
          <p className="text-harbor-navy/50 text-sm mt-0.5">Track and manage your financial goals</p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 bg-harbor-teal text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-harbor-teal/90 transition-colors flex-shrink-0"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          New Buoy
        </button>
      </div>

      {/* ── Empty state ── */}
      {buoys.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="w-16 h-16 rounded-full bg-harbor-teal-light flex items-center justify-center">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#2A9D8F" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>
            </svg>
          </div>
          <div className="text-center">
            <p className="text-harbor-navy font-semibold text-base">No buoys yet</p>
            <p className="text-harbor-navy/50 text-sm mt-1">Create your first savings goal to get started</p>
          </div>
          <button
            onClick={openNew}
            className="mt-2 flex items-center gap-2 bg-harbor-teal text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-harbor-teal/90 transition-colors"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Create First Buoy
          </button>
        </div>
      )}

      {/* ── Buoy cards grid ── */}
      {buoys.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {buoys.map((buoy) => {
            const pct = buoy.goal > 0 ? Math.min(100, Math.round((buoy.current / buoy.goal) * 100)) : 0;
            const isComplete = pct >= 100;
            return (
              <div
                key={buoy.id}
                className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col gap-4 shadow-sm"
              >
                {/* Name + auto-save badge */}
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-harbor-navy font-bold text-base leading-tight">{buoy.name}</h3>
                  {buoy.autoSave && buoy.autoSaveDay && (
                    <span className="flex items-center gap-1 text-harbor-teal bg-harbor-teal-light text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/>
                      </svg>
                      Auto
                    </span>
                  )}
                </div>

                {/* Progress bar */}
                <div>
                  <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${isComplete ? "bg-harbor-green" : "bg-harbor-teal"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>

                {/* Amounts */}
                <div className="flex items-end justify-between">
                  <span className={`text-2xl font-bold tabular-nums ${isComplete ? "text-harbor-green" : "text-harbor-teal"}`}>
                    {formatMoney(buoy.current)}
                  </span>
                  <div className="text-right">
                    <p className="text-harbor-navy/50 text-xs">of {formatMoney(buoy.goal)}</p>
                    <p className="text-harbor-navy/40 text-xs">{pct}% complete</p>
                  </div>
                </div>

                {/* Auto-save info */}
                {buoy.autoSave && buoy.autoSaveDay && (
                  <p className="text-harbor-navy/40 text-xs -mt-2">
                    {formatMoney(buoy.autoSave)}/mo · saves on the {buoy.autoSaveDay}{
                      buoy.autoSaveDay === 1 ? "st" : buoy.autoSaveDay === 2 ? "nd" : buoy.autoSaveDay === 3 ? "rd" : "th"
                    }
                  </p>
                )}

                {/* Quick add buttons */}
                <div className="grid grid-cols-3 gap-2">
                  {[10, 50, 100].map((amt) => (
                    <button
                      key={amt}
                      onClick={() => quickAdd(buoy.id, amt)}
                      className="py-2 border border-slate-200 rounded-lg text-xs font-medium text-harbor-navy hover:border-harbor-teal hover:text-harbor-teal hover:bg-harbor-teal-light transition-colors"
                    >
                      +${amt}
                    </button>
                  ))}
                </div>

                {/* Edit / Delete */}
                <div className="flex gap-2 pt-0.5">
                  <button
                    onClick={() => openEdit(buoy)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 border border-slate-200 rounded-lg text-xs font-medium text-harbor-navy hover:bg-slate-50 transition-colors"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                    Edit
                  </button>
                  <button
                    onClick={() => setDeleteId(buoy.id)}
                    className="w-10 flex items-center justify-center border border-slate-200 rounded-lg hover:border-harbor-red hover:bg-red-50 transition-colors"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#E63946" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
                      <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Modals ── */}
      {showModal && (
        <Modal
          title={editingId ? "Edit Buoy" : "New Buoy"}
          form={form}
          setForm={setForm}
          onSave={handleSave}
          onClose={() => setShowModal(false)}
        />
      )}

      {deleteId && deleteTarget && (
        <DeleteModal
          name={deleteTarget.name}
          onConfirm={handleDelete}
          onClose={() => setDeleteId(null)}
        />
      )}

      {toast && <Toast message={toast} />}
    </div>
  );
}
