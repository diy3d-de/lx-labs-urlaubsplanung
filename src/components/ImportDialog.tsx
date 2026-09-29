"use client";

import { useState } from "react";
import { format } from "date-fns";
import { FileUp, TriangleAlert } from "lucide-react";
import Modal from "./Modal";
import { bundeslandName } from "@/lib/bundeslaender";
import { saveBlob } from "@/lib/download";
import {
  MAX_IMPORT_BYTES,
  parseBackup,
  type Backup,
  type ImportMode,
  type ImportResult,
} from "@/lib/backup";

export default function ImportDialog({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: () => void;
}) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [backup, setBackup] = useState<Backup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<ImportMode>("merge");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const urlaubCount = backup?.personen.reduce((n, p) => n + p.urlaube.length, 0) ?? 0;
  // Ersetzen mit einer Datei ohne Personen würde alles löschen
  const replaceBlocked = mode === "replace" && backup?.personen.length === 0;

  async function selectFile(file: File | undefined) {
    setBackup(null);
    setError(null);
    setFileName(file?.name ?? null);
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      setError("Die Datei ist zu groß");
      return;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(await file.text());
    } catch {
      setError("Die Datei enthält kein gültiges JSON");
      return;
    }
    const parsed = parseBackup(raw);
    if (parsed.ok) setBackup(parsed.data);
    else setError(parsed.error);
  }

  async function runImport() {
    if (!backup || busy || replaceBlocked) return;
    if (
      mode === "replace" &&
      !window.confirm(
        `Alle aktuellen Personen und Urlaube werden durch ${backup.personen.length} Person(en) und ` +
          `${urlaubCount} Urlaub(e) aus der Datei ersetzt. Der aktuelle Stand wird vorher als ` +
          `Sicherung heruntergeladen. Fortfahren?`
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (mode === "replace") {
        // Sicherheitsnetz: aktuellen Stand speichern, bevor er ersetzt wird
        const current = await fetch("/api/backup");
        if (!current.ok) {
          setError("Sicherung des aktuellen Stands fehlgeschlagen – Ersetzen abgebrochen");
          return;
        }
        saveBlob(await current.blob(), `urlaubsplanung-vor-ersetzen-${format(new Date(), "yyyy-MM-dd-HHmm")}.json`);
      }
      const res = await fetch("/api/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, data: backup }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "Import fehlgeschlagen");
        return;
      }
      setResult(json);
      onImported();
    } catch {
      setError("Import fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <Modal title="Import abgeschlossen" onClose={onClose}>
        <div className="flex flex-col gap-4">
          <ul className="flex flex-col gap-1 rounded-lg bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)]">
            <li>{result.personenNeu} Person(en) neu angelegt</li>
            <li>{result.urlaubeNeu} Urlaub(e) importiert</li>
            {result.urlaubeUebersprungen > 0 && (
              <li className="text-[var(--text-muted)]">
                {result.urlaubeUebersprungen} bereits vorhandene Urlaub(e) übersprungen
              </li>
            )}
          </ul>
          <div className="flex justify-end">
            <button
              onClick={onClose}
              className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-[#03202c] hover:bg-[var(--accent-strong)] cursor-pointer"
            >
              Schließen
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  const exportedAt = backup?.exportedAt ? new Date(backup.exportedAt) : null;

  return (
    // Während des Imports nicht schließbar – sonst sähe es nach Abbruch aus, obwohl er weiterläuft
    <Modal title="Backup importieren" onClose={busy ? () => {} : onClose}>
      <div className="flex flex-col gap-4">
        <label className="flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border border-dashed border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-4 text-center hover:border-[var(--text-faint)] focus-within:border-[var(--accent)]">
          <FileUp size={18} className="text-[var(--text-muted)]" />
          <span className="max-w-full truncate text-sm text-[var(--text)]">
            {fileName ?? "Export-Datei (.json) auswählen"}
          </span>
          <input
            type="file"
            accept=".json,application/json"
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              selectFile(e.target.files?.[0]);
              // Erlaubt, dieselbe (ggf. korrigierte) Datei erneut zu wählen
              e.target.value = "";
            }}
          />
        </label>

        {backup && (
          <div className="flex flex-col gap-0.5 rounded-lg bg-[var(--bg-elevated)] px-3 py-2 text-sm">
            <span className="text-[var(--text)]">
              {backup.personen.length} Person(en) · {urlaubCount} Urlaub(e)
            </span>
            <span className="text-xs text-[var(--text-muted)]">
              Bundesland: {bundeslandName(backup.settings.bundesland)}
              {exportedAt && !isNaN(exportedAt.getTime()) && (
                <> · exportiert am {exportedAt.toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" })}</>
              )}
            </span>
          </div>
        )}

        <fieldset className="flex flex-col gap-2" disabled={busy}>
          <legend className="mb-1.5 text-xs font-medium text-[var(--text-muted)]">Modus</legend>
          <ModeOption
            checked={mode === "merge"}
            onChange={() => setMode("merge")}
            label="Zusammenführen"
            hint="Vorhandene Daten bleiben erhalten. Personen werden über den Namen zugeordnet (ihr Urlaubsanspruch bleibt unverändert), doppelte Urlaube werden übersprungen."
          />
          <ModeOption
            checked={mode === "replace"}
            onChange={() => setMode("replace")}
            label="Ersetzen"
            hint="Alle vorhandenen Personen und Urlaube werden durch die Datei ersetzt, inkl. Urlaubsanspruch und Bundesland. Der aktuelle Stand wird vorher als Sicherung heruntergeladen."
          />
        </fieldset>

        {mode === "replace" && backup && (
          <p className="flex items-start gap-2 rounded-lg bg-[var(--danger)]/10 px-3 py-2 text-xs text-[var(--danger)]">
            <TriangleAlert size={14} className="mt-px shrink-0" />
            {replaceBlocked
              ? "Die Datei enthält keine Personen – Ersetzen würde alle Daten löschen und ist deshalb gesperrt."
              : "Alle aktuell eingetragenen Daten werden ersetzt."}
          </p>
        )}

        {error && <p className="text-sm text-[var(--danger)]">{error}</p>}

        <div className="mt-2 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={runImport}
            disabled={!backup || busy || replaceBlocked}
            className={`rounded-lg px-3 py-2 text-sm font-medium cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${
              mode === "replace"
                ? "bg-[var(--danger)] text-[#2b0a12] hover:opacity-90"
                : "bg-[var(--accent)] text-[#03202c] hover:bg-[var(--accent-strong)]"
            }`}
          >
            {busy ? "Importiert…" : mode === "replace" ? "Ersetzen" : "Importieren"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function ModeOption({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  hint: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 select-none">
      <input
        type="radio"
        name="import-mode"
        checked={checked}
        onChange={onChange}
        className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)] cursor-pointer"
      />
      <span className="flex flex-col">
        <span className="text-sm text-[var(--text)]">{label}</span>
        <span className="text-xs text-[var(--text-muted)]">{hint}</span>
      </span>
    </label>
  );
}
