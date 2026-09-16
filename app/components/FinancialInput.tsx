import type { ComponentPropsWithRef } from "react";

// Keep each caller's parsing, validation, formatting and controlled value intact.
export function FinancialInput(props: ComponentPropsWithRef<"input">) {
  return <input inputMode="decimal" {...props} />;
}
