"use client";

import { useState } from "react";
import { format } from "date-fns";
import Modal from "./Modal";
import type { Person, Vacation } from "@/lib/types";

export default function VacationDialog({
  personen,
  initialPersonId,
  vacation,
  defaultStartDate,
  defaultEndDate,
  onClose,
  onSave,
  onDelete,
}: {
  personen: Person[];
  initialPersonId: string;
  vacation: Vacation | null;
  defaultStartDate?: Date;
  defaultEndDate?: Date;
  onClose: () => void;
  onSave: (data: {
    personId: string;
    startDate: string;
    endDate: string;
    halfDay: boolean;
    note: string;
  }) => Promise<void> | void;
  onDelete?: () => void;
}) {
  const initialStart = vacation?.startDate.slice(0, 10) ?? format(defaultStartDate ?? new Date(), "yyyy-MM-dd");
  const initialEnd = vacation?.endDate.slice(0, 10) ?? format(defaultEndDate ?? defaultStartDate ?? new Date(), "yyyy-MM-dd");
  const [personId, setPersonId] = useState(vacation?.personId ?? initialPersonId);
  const [startDate, setStartDate] = useState(initialStart);
  const [endDate, setEndDate] = useState(initialEnd);
  const [halfDay, setHalfDay] = useState(vacation?.halfDay ?? false);
  const [note, setNote] = useState(vacation?.note ?? "");
  const [saving, setSaving] = useState(false);
  const isSingleDay = startDate === endDate;

  return (
    <Modal title={vacation ? "Urlaub bearbeiten" : "Urlaub eintragen"} onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!personId || !startDate || !endDate || endDate < startDate || saving) return;
          // Dialog bleibt bis zur Serverantwort offen – kein doppeltes Anlegen per Doppelklick
          setSaving(true);
          try {
            await onSave({ personId, startDate, endDate, halfDay: isSingleDay && halfDay, note: note.trim() });
          } finally {
            setSaving(false);
          }
        }}
        className="flex flex-col gap-4"
      >
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-[var(--text-muted)]">Person</span>
          <select
            value={personId}
            onChange={(e) => setPersonId(e.target.value)}
            className="h-9 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-2 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)] cursor-pointer"
          >
            {personen.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>

        <div className="flex gap-3">
          <label className="flex flex-1 flex-col gap-1.5">
            <span className="text-xs font-medium text-[var(--text-muted)]">Von</span>
            <input
              type="date"
              value={startDate}
              min="1900-01-01"
              max="9999-12-31"
              onChange={(e) => {
                setStartDate(e.target.value);
                if (e.target.value > endDate) setEndDate(e.target.value);
              }}
              className="h-9 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-2 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]"
            />
          </label>
          <label className="flex flex-1 flex-col gap-1.5">
            <span className="text-xs font-medium text-[var(--text-muted)]">Bis</span>
            <input
              type="date"
              value={endDate}
              min={startDate}
              max="9999-12-31"
              onChange={(e) => setEndDate(e.target.value)}
              className="h-9 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-2 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]"
            />
          </label>
        </div>

        {isSingleDay && (
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={halfDay}
              onChange={(e) => setHalfDay(e.target.checked)}
              className="h-4 w-4 accent-[var(--accent)] cursor-pointer"
            />
            <span className="text-sm text-[var(--text)]">Nur halber Tag</span>
          </label>
        )}

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-[var(--text-muted)]">Notiz (optional)</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="z. B. Hauptreise"
            className="h-9 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]"
          />
        </label>

        <div className="mt-2 flex items-center justify-between gap-2">
          {vacation && onDelete ? (
            <button
              type="button"
              onClick={onDelete}
              className="rounded-lg px-3 py-2 text-sm text-[var(--danger)] hover:bg-[var(--danger)]/10 cursor-pointer"
            >
              Löschen
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-[#03202c] hover:bg-[var(--accent-strong)] cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
            >
              Speichern
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
