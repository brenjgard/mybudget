"use client";

import type { ReactNode } from "react";

// Summary content is non-interactive. Actions and expanded content belong outside
// this header, so they cannot bubble into the disclosure button.
export function DisclosureHeader({ expanded, onToggle, label, className = "", children }: {
  expanded: boolean;
  onToggle: () => void;
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return <div className={`relative min-h-12 ${className}`}>
    <div className="pointer-events-none pr-8">{children}</div>
    <button type="button" aria-expanded={expanded} aria-label={`${expanded ? "Collapse" : "Expand"} ${label}`} onClick={onToggle}
      className="absolute inset-0 flex w-full items-center justify-end rounded-[inherit] px-3 text-harbor-navy/60 hover:bg-harbor-navy/5 focus-visible:outline-2 focus-visible:outline-harbor-teal focus-visible:-outline-offset-2">
      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={expanded ? "rotate-180" : ""}><path d="m6 9 6 6 6-6" /></svg>
    </button>
  </div>;
}
