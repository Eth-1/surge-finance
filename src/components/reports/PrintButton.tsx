"use client";

export function PrintButton() {
  return (
    <button className="btn btn-ghost no-print" onClick={() => window.print()}>
      🖨️ Print / PDF
    </button>
  );
}
