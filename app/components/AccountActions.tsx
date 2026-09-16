"use client";

export function AccountIcon({ kind }: { kind: "feedback" | "signout" }) {
  return <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
    {kind === "feedback" ? <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /> : <><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" /></>}
  </svg>;
}

export function AccountActions({ settings = false }: { settings?: boolean }) {
  const controlClass = settings
    ? "flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left text-sm font-semibold text-harbor-navy hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-harbor-teal focus-visible:-outline-offset-2"
    : "flex min-h-12 items-center gap-1.5 border-b-2 border-transparent px-4 py-3 text-sm font-medium text-slate-500 transition-colors hover:border-slate-200 hover:text-harbor-navy whitespace-nowrap focus-visible:outline-2 focus-visible:outline-harbor-teal";
  return <>
    <button type="button" onClick={() => window.dispatchEvent(new Event("harbor:open-feedback"))} className={controlClass}>
      <AccountIcon kind="feedback" />{settings ? "Send Feedback" : "Feedback"}
      {settings && <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ml-auto"><path d="m9 6 6 6-6 6" /></svg>}
    </button>
    <form action="/auth/signout" method="post">
      <button type="submit" className={controlClass}><AccountIcon kind="signout" />Sign Out</button>
    </form>
  </>;
}
