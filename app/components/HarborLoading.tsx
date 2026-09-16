export function HarborLoading({ label = "Loading Harbor" }: { label?: string }) {
  return <span role="status" className="inline-flex items-center gap-3">
    <svg aria-hidden="true" width="32" height="36" viewBox="0 0 32 36" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-harbor-teal">
      <path d="M3 10h20l-4 5H7zM12 10V3l7 5h-7" />
      <g className="harbor-anchor"><path d="M23 20v11m-6-6c0 8 12 8 12 0m-12 0-1 3m13-3 1 3M20 23h6"/><circle cx="23" cy="18" r="2"/></g>
    </svg>{label}...
  </span>;
}
