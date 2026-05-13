"use client";

import { useState } from "react";

export function HelpTooltip({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <span className={`relative inline-flex ${className}`}>
      <button
        type="button"
        aria-label={`Help: ${title}`}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-harbor-teal/30 bg-harbor-teal-light text-[11px] font-bold text-harbor-teal transition-colors hover:border-harbor-teal hover:bg-white focus:outline-none focus:ring-2 focus:ring-harbor-teal/25"
      >
        ?
      </button>
      {open && (
        <span className="absolute right-0 top-7 z-40 w-64 rounded-xl border border-harbor-teal-light bg-white p-3 text-left shadow-lg">
          <span className="block text-xs font-semibold uppercase tracking-wide text-harbor-teal">{title}</span>
          <span className="mt-1 block text-sm leading-5 text-harbor-navy/65">{children}</span>
        </span>
      )}
    </span>
  );
}

