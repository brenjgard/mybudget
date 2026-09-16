"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { AccountActions } from "./AccountActions";

const NAV_LINKS = [
  {
    href: "/budget",
    label: "Budget",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 19.5V4.5A2.5 2.5 0 016.5 2H20v20H6.5A2.5 2.5 0 014 19.5z"/>
        <path d="M8 7h8"/>
        <path d="M8 11h8"/>
        <path d="M8 15h5"/>
      </svg>
    ),
  },
  {
    href: "/dock",
    label: "Dock",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 20h18"/>
        <path d="M6 20V8l6-4 6 4v12"/>
        <path d="M9 20v-6h6v6"/>
      </svg>
    ),
  },
  {
    href: "/fleet",
    label: "Fleet",
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 10h18M7 15h4"/></svg>,
  },
  {
    href: "/settings",
    label: "Settings",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>
      </svg>
    ),
  },
];

export default function NavBar() {
  const pathname = usePathname();
  const isAuthPage = pathname === "/login" || pathname === "/signup" || pathname.startsWith("/beta");

  return (
    <header className="sticky top-0 flex-shrink-0 z-40">

      {/* ── Row 1: Brand bar ── */}
      <div className="bg-harbor-navy flex h-14 items-center px-3 sm:px-4 md:h-20 md:px-8">
        <Link href={isAuthPage ? "/beta" : "/budget"} className="flex items-center gap-3 min-w-0">
          <Image
            src="/harbor-logo.svg"
            alt="Harbor"
            width={44}
            height={44}
            className="block flex-shrink-0 object-contain brightness-0 invert"
            priority
          />
          <span className="font-bold text-white text-lg tracking-wide md:text-xl">Harbor</span>
          <span className="text-harbor-teal text-sm font-medium ml-1 hidden sm:inline">Plan ahead. Stay ahead.</span>
        </Link>

      </div>

      {/* ── Row 2: Tab navigation ── */}
      {!isAuthPage && (
      <div className="hidden md:block bg-white border-b border-slate-200 overflow-x-auto">
        <div className="px-4 md:px-8 flex items-end gap-0 min-w-max">
          {NAV_LINKS.map(({ href, label, icon }) => {
            const isActive = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={isActive ? "page" : undefined}
                className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  isActive
                    ? "text-harbor-teal border-harbor-teal"
                    : "text-slate-500 border-transparent hover:text-harbor-navy hover:border-slate-200"
                }`}
              >
                {icon}
                {label}
              </Link>
            );
          })}
          <AccountActions />
        </div>
      </div>
      )}

      {!isAuthPage && <nav aria-label="Primary navigation" className="harbor-bottom-nav fixed inset-x-0 bottom-0 grid grid-cols-4 border-t border-slate-200 bg-white md:hidden">
        {NAV_LINKS.map(({ href, label, icon }) => <Link key={href} href={href} aria-current={pathname.startsWith(href) ? "page" : undefined} className={`flex min-h-14 flex-col items-center justify-center gap-1 text-xs font-semibold ${pathname.startsWith(href) ? "bg-harbor-teal-light text-harbor-teal" : "text-harbor-navy/60"}`}>
          <span aria-hidden="true">{icon}</span>{label}
        </Link>)}
      </nav>}
    </header>
  );
}
