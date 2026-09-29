"use client";

import { useState } from "react";
import Modal from "./Modal";
import type { Person } from "@/lib/types";

export interface PersonFormData {
  name: string;
  isStudent: boolean;
  vacationDays: number;
  heiligabendHalf: boolean;
  silvesterHalf: boolean;
}

export default function PersonDialog({
  person,
  onClose,
  onSave,
  onDelete,
}: {
  person: Person | null;
  onClose: () => void;
  onSave: (data: PersonFormData) => Promise<void> | void;
  onDelete?: () => void;
}) {
  const [name, setName] = useState(person?.name ?? "");
  const [isStudent, setIsStudent] = useState(person?.isStudent ?? false);
  const [vacationDays, setVacationDays] = useState(String(person?.vacationDays ?? 30));
  const [heiligabendHalf, setHeiligabendHalf] = useState(person?.heiligabendHalf ?? true);
  const [silvesterHalf, setSilvesterHalf] = useState(person?.silvesterHalf ?? true);
  const [saving, setSaving] = useState(false);

  return (
    <Modal title={person ? "Person bearbeiten" : "Person hinzufügen"} onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim() || saving) return;
          const days = parseFloat(vacationDays.replace(",", "."));
          if (Number.isNaN(days) || days < 0) return;
          // Dialog bleibt bis zur Serverantwort offen – kein doppeltes Anlegen per Doppelklick
          setSaving(true);
          try {
            await onSave({ name: name.trim(), isStudent, vacationDays: days, heiligabendHalf, silvesterHalf });
          } finally {
            setSaving(false);
          }
        }}
        className="flex flex-col gap-4"
      >
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-[var(--text-muted)]">Name</span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="z. B. Anna Müller"
            className="h-9 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]"
          />
        </label>

        <label className="flex items-center gap-2.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={isStudent}
            onChange={(e) => setIsStudent(e.target.checked)}
            className="h-4 w-4 accent-[var(--accent)] cursor-pointer"
          />
          <span className="text-sm text-[var(--text)]">Status: Schüler/in</span>
        </label>

        {!isStudent && (
          <div className="flex flex-col gap-3 rounded-lg border border-[var(--border-soft)] bg-[var(--bg-elevated)] p-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-[var(--text-muted)]">
                Urlaubsanspruch (Tage/Jahr)
              </span>
              <input
                inputMode="decimal"
                value={vacationDays}
                onChange={(e) => setVacationDays(e.target.value)}
                className="h-9 w-28 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]"
              />
            </label>

            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={heiligabendHalf}
                onChange={(e) => setHeiligabendHalf(e.target.checked)}
                className="h-4 w-4 accent-[var(--accent)] cursor-pointer"
              />
              <span className="text-sm text-[var(--text)]">24.12. zählt als halber Urlaubstag</span>
            </label>
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={silvesterHalf}
                onChange={(e) => setSilvesterHalf(e.target.checked)}
                className="h-4 w-4 accent-[var(--accent)] cursor-pointer"
              />
              <span className="text-sm text-[var(--text)]">31.12. zählt als halber Urlaubstag</span>
            </label>
          </div>
        )}

        <div className="mt-2 flex items-center justify-between gap-2">
          {person && onDelete ? (
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
