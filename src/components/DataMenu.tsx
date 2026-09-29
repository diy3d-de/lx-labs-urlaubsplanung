"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Database, ChevronDown, Download, Upload, CalendarArrowDown } from "lucide-react";
import { saveBlob } from "@/lib/download";

export default function DataMenu({
  onImport,
  onError,
}: {
  onImport: () => void;
  onError: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);

  async function download(url: string, extension: "json" | "ics") {
    setOpen(false);
    try {
      const res = await fetch(url);
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        onError(data?.error || "Export fehlgeschlagen");
        return;
      }
      saveBlob(await res.blob(), `urlaubsplanung-${format(new Date(), "yyyy-MM-dd")}.${extension}`);
    } catch {
      onError("Export fehlgeschlagen");
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title="Daten exportieren / importieren"
        aria-label="Daten exportieren / importieren"
        className="flex h-9 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text)] hover:border-[var(--text-faint)] cursor-pointer"
      >
        <Database size={15} />
        <span className="hidden sm:inline">Daten</span>
        <ChevronDown size={14} className="text-[var(--text-muted)]" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-1.5 w-60 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-xl">
            <button
              onClick={() => download("/api/backup", "json")}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--text)] hover:bg-[var(--surface-hover)] cursor-pointer"
            >
              <Download size={14} className="text-[var(--text-muted)]" />
              Backup exportieren (JSON)
            </button>
            <button
              onClick={() => {
                setOpen(false);
                onImport();
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--text)] hover:bg-[var(--surface-hover)] cursor-pointer"
            >
              <Upload size={14} className="text-[var(--text-muted)]" />
              Backup importieren…
            </button>
            <button
              onClick={() => download("/api/ics", "ics")}
              title="Für Outlook, Google oder Apple Kalender"
              className="flex w-full items-center gap-2 border-t border-[var(--border-soft)] px-3 py-2 text-left text-sm text-[var(--text)] hover:bg-[var(--surface-hover)] cursor-pointer"
            >
              <CalendarArrowDown size={14} className="text-[var(--text-muted)]" />
              Kalender exportieren (.ics)
            </button>
          </div>
        </>
      )}
    </div>
  );
}
