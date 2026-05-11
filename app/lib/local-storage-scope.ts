"use client";

const warnedLegacyKeys = new Set<string>();

function getSupabaseScope() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return "no-supabase";

  try {
    return new URL(url).host.replace(/[^a-z0-9.-]/gi, "_");
  } catch {
    return url.replace(/[^a-z0-9.-]/gi, "_");
  }
}

export function scopedStorageKey(key: string) {
  return `${key}:${getSupabaseScope()}`;
}

export function warnIfLegacyStorageExists(key: string, label: string) {
  if (process.env.NODE_ENV !== "development") return;
  if (typeof window === "undefined") return;
  if (warnedLegacyKeys.has(key)) return;
  if (!localStorage.getItem(key)) return;

  warnedLegacyKeys.add(key);
  console.warn(
    `[Harbor] Ignoring legacy unscoped localStorage ${label} at "${key}". Local fallback now uses "${scopedStorageKey(key)}" so data is isolated by Supabase project URL.`,
  );
}
