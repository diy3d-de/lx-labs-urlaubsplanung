"use client";

import { VIEW_MODE_LABELS, type ViewMode } from "@/lib/types";

const MODES: ViewMode[] = ["month", "quarter", "halfyear", "year"];

export default function ViewSwitcher({
  value,
  onChange,
}: {
  value: ViewMode;
  onChange: (v: ViewMode) => void;
}) {
  return (
    <div className="flex rounded-lg border border-[var(--border)] bg-[var(--surface)] p-0.5">
      {MODES.map((m) => (
        <button
          key={m}
          onClick={() => onChange(m)}
          className={`rounded-md px-3 py-1.5 text-sm transition-colors cursor-pointer ${
            value === m
              ? "bg-[var(--accent)] text-[#03202c] font-medium"
              : "text-[var(--text-muted)] hover:text-[var(--text)]"
          }`}
        >
          {VIEW_MODE_LABELS[m]}
        </button>
      ))}
    </div>
  );
}
