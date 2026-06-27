"use client";

import { HarborSpreadsheetDock } from "../components/HarborSpreadsheetDock";
import { useHarborMonth } from "../lib/use-harbor-month";

export default function DockPage() {
  const harbor = useHarborMonth();

  if (!harbor.loaded || !harbor.settings) {
    return (
      <main className="flex-1 bg-harbor-offwhite p-4 text-sm text-harbor-navy/60">
        Loading Dock...
      </main>
    );
  }

  return <HarborSpreadsheetDock harbor={harbor} />;
}
