"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/", label: "Dock" },
  { href: "/buoys", label: "Buoys" },
  { href: "/settings", label: "Settings" },
];

export default function NavBar() {
  const pathname = usePathname();

  return (
    <nav className="bg-harbor-navy text-white px-6 h-14 flex items-center justify-between shadow-lg flex-shrink-0">
      <div className="flex items-center gap-3">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-harbor-teal">
          <path d="M12 2v6M8 6l4-4 4 4" />
          <path d="M3 18c0-4 9-4 9-10M21 18c0-4-9-4-9-10" />
          <path d="M2 22h20" />
        </svg>
        <div className="flex items-center gap-2">
          <span className="font-bold text-lg tracking-tight">Harbor</span>
          <span className="hidden sm:inline text-xs text-harbor-teal opacity-90">Plan ahead. Stay ahead.</span>
        </div>
      </div>
      <div className="flex items-center gap-1">
        {NAV_LINKS.map(({ href, label }) => {
          const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? "bg-harbor-teal text-white"
                  : "text-white/70 hover:text-white hover:bg-white/10"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
