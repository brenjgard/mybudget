"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

export function ActionSheet({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!open || !dialog) return;
    const previous = document.activeElement as HTMLElement | null;
    dialog.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { dialog.close(); document.body.style.overflow = overflow; previous?.focus(); };
  }, [open]);
  return <dialog ref={ref} aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }} className="fixed inset-x-0 top-auto bottom-0 m-0 max-h-[85dvh] w-full max-w-none overflow-y-auto rounded-t-2xl border border-slate-200 bg-white p-0 text-harbor-navy shadow-xl backdrop:bg-harbor-navy/40 sm:inset-0 sm:m-auto sm:max-w-sm sm:rounded-2xl">
    <div className="p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
      <div className="mb-4 flex items-center justify-between gap-3"><h2 id={titleId} className="text-lg font-bold">{title}</h2><button type="button" aria-label="Close actions" onClick={onClose} className="min-h-11 min-w-11 rounded-lg text-xl hover:bg-slate-100">×</button></div>
      <div className="grid gap-2 [&>button]:min-h-12 [&>button]:rounded-lg [&>button]:px-3 [&>button]:text-left [&>a]:flex [&>a]:min-h-12 [&>a]:items-center [&>a]:rounded-lg [&>a]:px-3">{children}</div>
    </div>
  </dialog>;
}
