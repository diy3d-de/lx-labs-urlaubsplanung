"use client";

import { BUNDESLAENDER } from "@/lib/bundeslaender";

export default function BundeslandSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (code: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text)] outline-none transition-colors hover:border-[var(--text-faint)] focus:border-[var(--accent)] cursor-pointer"
    >
      {BUNDESLAENDER.map((b) => (
        <option key={b.code} value={b.code}>
          {b.name}
        </option>
      ))}
    </select>
  );
}
