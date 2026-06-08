"use client";

import { Printer } from "lucide-react";

export function PrintButton() {
  return (
    <button className="btn btn-ghost no-print gap-1.5" onClick={() => window.print()}>
      <Printer size={15} /> Print / PDF
    </button>
  );
}
