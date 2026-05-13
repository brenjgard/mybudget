"use client";

import { useState } from "react";

export function InfoCallout({
  id,
  title,
  children,
  action,
}: {
  id?: string;
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  const storageKey = id ? `harbor.help.dismissed.${id}` : null;
  const [dismissed, setDismissed] = useState(() => (
    typeof window !== "undefined" && storageKey
      ? window.localStorage.getItem(storageKey) === "1"
      : false
  ));

  function dismiss() {
    if (storageKey) window.localStorage.setItem(storageKey, "1");
    setDismissed(true);
  }

  if (dismissed) return null;

  return (
    <div className="rounded-2xl border border-harbor-teal-light bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-harbor-teal-light text-harbor-teal">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-harbor-navy">{title}</p>
          <div className="mt-1 text-sm leading-6 text-harbor-navy/65">{children}</div>
          {action && <div className="mt-3">{action}</div>}
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="rounded-lg p-1 text-harbor-navy/35 transition-colors hover:bg-slate-50 hover:text-harbor-navy"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
