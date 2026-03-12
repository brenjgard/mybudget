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
      <div className="flex items-center gap-2">
        <img
          src="/harbor-logo.svg"
          alt="Harbor"
          className="h-8 w-auto brightness-0 invert"
        />
        <span className="font-bold text-white text-lg tracking-wide">
          HARBOR
        </span>
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
