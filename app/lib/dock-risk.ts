// Weekly risk is based on the lowest projected balance, never the ending balance.
export function dockRisk(lowest: number) {
  if (lowest < 0) return { label: "Negative", surface: "border-red-300 bg-red-50", text: "text-red-800", badge: "bg-red-100 text-red-800" };
  if (lowest < 500) return { label: "High risk", surface: "border-orange-300 bg-orange-50", text: "text-orange-800", badge: "bg-orange-100 text-orange-800" };
  if (lowest <= 1500) return { label: "Caution", surface: "border-amber-300 bg-amber-50", text: "text-amber-800", badge: "bg-amber-100 text-amber-800" };
  return { label: "Healthy", surface: "border-slate-200 bg-white", text: "text-teal-800", badge: "bg-teal-50 text-teal-800" };
}
