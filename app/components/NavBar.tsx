"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";

const NAV_LINKS = [
  {
    href: "/dashboard",
    label: "My Harbor",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
        <polyline points="9 22 9 12 15 12 15 22"/>
      </svg>
    ),
  },
  {
    href: "/buoys",
    label: "Buoys",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <circle cx="12" cy="12" r="6"/>
        <circle cx="12" cy="12" r="2"/>
      </svg>
    ),
  },
  {
    href: "/",
    label: "Dock",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/>
        <path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/>
      </svg>
    ),
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
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const isAuthPage = pathname === "/login" || pathname === "/signup";

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  async function handleSignOut() {
    await fetch("/auth/signout", { method: "POST" });
    setMenuOpen(false);
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="flex-shrink-0 relative z-40" ref={menuRef}>

      {/* ── Row 1: Brand bar ── */}
      <div className="bg-harbor-navy h-20 flex items-center justify-between px-4 md:px-8">
        <Link href="/dashboard" className="flex items-center gap-3 min-w-0">
          <img
            src="/harbor-logo.svg"
            alt="Harbor"
            width={52}
            height={52}
            className="block flex-shrink-0 mix-blend-multiply"
          />
          <span className="font-bold text-white text-xl tracking-wide">Harbor</span>
          <span className="text-harbor-teal text-sm font-medium ml-1 hidden sm:inline">Plan ahead. Stay ahead.</span>
        </Link>

        {/* Hamburger */}
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="text-white/80 hover:text-white p-2 rounded-md hover:bg-white/10 transition-colors flex-shrink-0"
          aria-label="Toggle menu"
          aria-expanded={menuOpen}
        >
          {menuOpen ? (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="21" y2="6"/>
              <line x1="3" y1="12" x2="21" y2="12"/>
              <line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          )}
        </button>
      </div>

      {/* ── Row 2: Tab navigation ── */}
      <div className="bg-white border-b border-slate-200 overflow-x-auto">
        <div className="px-4 md:px-8 flex items-end gap-0 min-w-max">
          {NAV_LINKS.map(({ href, label, icon }) => {
            const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setMenuOpen(false)}
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
          {!isAuthPage && (
            <button
              onClick={handleSignOut}
              className="flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 border-transparent text-slate-500 hover:text-harbor-navy hover:border-slate-200 transition-colors whitespace-nowrap"
            >
              Sign Out
            </button>
          )}
        </div>
      </div>

      {/* ── Hamburger dropdown menu ── */}
      {menuOpen && (
        <div className="absolute top-full right-4 md:right-8 w-56 bg-white border border-slate-200 rounded-b-xl shadow-lg overflow-hidden">
          {NAV_LINKS.map(({ href, label, icon }) => {
            const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setMenuOpen(false)}
                className={`flex items-center gap-3 px-5 py-3.5 text-sm font-medium border-b border-slate-50 last:border-0 transition-colors ${
                  isActive
                    ? "text-harbor-teal bg-harbor-teal-light"
                    : "text-harbor-navy hover:bg-slate-50"
                }`}
              >
                <span className={isActive ? "text-harbor-teal" : "text-slate-400"}>{icon}</span>
                {label}
                {isActive && (
                  <span className="ml-auto w-1.5 h-1.5 rounded-full bg-harbor-teal" />
                )}
              </Link>
            );
          })}
          {!isAuthPage && (
            <button
              onClick={handleSignOut}
              className="w-full text-left px-5 py-3.5 text-sm font-medium text-harbor-navy hover:bg-slate-50 transition-colors border-t border-slate-100"
            >
              Sign Out
            </button>
          )}
        </div>
      )}

    </header>
  );
}
