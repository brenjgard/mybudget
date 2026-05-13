export function EmptyState({
  title,
  children,
  action,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl border border-dashed border-harbor-teal-light bg-harbor-offwhite px-4 py-6 text-center ${className}`}>
      <p className="text-sm font-semibold text-harbor-navy">{title}</p>
      <div className="mx-auto mt-1 max-w-sm text-sm leading-6 text-harbor-navy/55">{children}</div>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

