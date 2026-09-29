"use client";

import { Printer } from "lucide-react";

export default function PrintButton() {
  function printLandscape() {
    const style = document.createElement("style");
    style.id = "print-orientation";
    style.textContent = `@page { size: A4 landscape; margin: 10mm; }`;
    document.head.appendChild(style);
    const cleanup = () => {
      style.remove();
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    window.print();
  }

  return (
    <button
      onClick={printLandscape}
      className="flex h-9 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text)] hover:border-[var(--text-faint)] cursor-pointer"
    >
      <Printer size={15} />
      Drucken / PDF
    </button>
  );
}
