"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, CalendarDays, AlertTriangle, Pencil } from "lucide-react";
import CalendarGrid from "./CalendarGrid";
import ViewSwitcher from "./ViewSwitcher";
import BundeslandSelect from "./BundeslandSelect";
import PrintButton from "./PrintButton";
import DataMenu from "./DataMenu";
import ImportDialog from "./ImportDialog";
import PersonDialog, { type PersonFormData } from "./PersonDialog";
import VacationBalance from "./VacationBalance";
import VacationDialog from "./VacationDialog";
import UpdateAnzeige from "./UpdateAnzeige";
import { formatLocalDate, getRange, rangeLabel, shiftAnchor } from "@/lib/dateRange";
import { bundeslandName } from "@/lib/bundeslaender";
import { PERSON_COLOR_VARS, personInitials, type Person, type Vacation, type ViewMode } from "@/lib/types";
import type { PublicHoliday, SchoolHolidayPeriod } from "@/lib/holidays";

async function readJson(res: Response) {
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error || `Anfrage fehlgeschlagen (${res.status})`);
  }
  return data;
}

export default function CalendarApp() {
  const [viewMode, setViewMode] = useState<ViewMode>("year");
  const [anchor, setAnchor] = useState(new Date());
  const [bundesland, setBundesland] = useState<string | null>(null);
  const [personen, setPersonen] = useState<Person[]>([]);
  const [urlaube, setUrlaube] = useState<Vacation[]>([]);
  const [feiertage, setFeiertage] = useState<PublicHoliday[]>([]);
  const [ferien, setFerien] = useState<SchoolHolidayPeriod[]>([]);
  const [ferienFailed, setFerienFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  // Wird nach einem Import erhöht, um alle Daten neu zu laden
  const [dataVersion, setDataVersion] = useState(0);

  const [personDialog, setPersonDialog] = useState<{ person: Person | null } | null>(null);
  const [vacationDialog, setVacationDialog] = useState<{
    initialPersonId: string;
    vacation: Vacation | null;
    startDate?: Date;
    endDate?: Date;
  } | null>(null);

  const { start, end } = useMemo(() => getRange(viewMode, anchor), [viewMode, anchor]);
  const year = anchor.getFullYear();

  const [yearUrlaube, setYearUrlaube] = useState<Vacation[]>([]);
  const [yearHolidays, setYearHolidays] = useState<PublicHoliday[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const [settingsRes, personenRes] = await Promise.all([
          fetch("/api/settings"),
          fetch("/api/personen"),
        ]);
        const settings = await readJson(settingsRes);
        const personenData = await readJson(personenRes);
        setBundesland(settings.bundesland);
        setPersonen(personenData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Laden fehlgeschlagen");
      } finally {
        setLoading(false);
      }
    })();
  }, [dataVersion]);

  useEffect(() => {
    const params = new URLSearchParams({
      from: formatLocalDate(start),
      to: formatLocalDate(end),
    });
    fetch(`/api/urlaube?${params}`)
      .then(readJson)
      .then(setUrlaube)
      .catch((err) => setError(err instanceof Error ? err.message : "Urlaube konnten nicht geladen werden"));
  }, [start, end, dataVersion]);

  useEffect(() => {
    const params = new URLSearchParams({ from: `${year}-01-01`, to: `${year}-12-31` });
    fetch(`/api/urlaube?${params}`)
      .then(readJson)
      .then(setYearUrlaube)
      .catch((err) => setError(err instanceof Error ? err.message : "Urlaube konnten nicht geladen werden"));
  }, [year, dataVersion]);

  useEffect(() => {
    if (!bundesland) return;
    fetch(`/api/feiertage?year=${year}&bundesland=${bundesland}`)
      .then(readJson)
      .then((r) => setYearHolidays(r.feiertage ?? []))
      .catch((err) => setError(err instanceof Error ? err.message : "Feiertage konnten nicht geladen werden"));
  }, [bundesland, year]);

  useEffect(() => {
    if (!bundesland) return;
    const years = Array.from(new Set([start.getFullYear(), end.getFullYear()]));
    Promise.all(
      years.map((y) => fetch(`/api/feiertage?year=${y}&bundesland=${bundesland}`).then(readJson))
    )
      .then((results) => {
        setFeiertage(results.flatMap((r) => r.feiertage ?? []));
        setFerien(results.flatMap((r) => r.ferien ?? []));
        setFerienFailed(results.some((r) => r.ferienFailed));
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Feiertage konnten nicht geladen werden"));
  }, [bundesland, start, end]);

  async function updateBundesland(code: string) {
    const prev = bundesland;
    setBundesland(code);
    try {
      await readJson(
        await fetch("/api/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bundesland: code }),
        })
      );
    } catch (err) {
      setBundesland(prev);
      setError(err instanceof Error ? err.message : "Bundesland konnte nicht gespeichert werden");
    }
  }

  async function savePerson(data: PersonFormData, existing: Person | null) {
    try {
      if (existing) {
        const updated = await readJson(
          await fetch(`/api/personen/${existing.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
          })
        );
        setPersonen((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      } else {
        const color = PERSON_COLOR_VARS[personen.length % PERSON_COLOR_VARS.length];
        const created = await readJson(
          await fetch("/api/personen", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...data, color }),
          })
        );
        setPersonen((prev) => [...prev, created]);
      }
      setPersonDialog(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Person konnte nicht gespeichert werden");
    }
  }

  async function deletePerson(id: string, name: string) {
    const betroffen = urlaube.filter((v) => v.personId === id).length;
    const hint = betroffen > 0 ? ` Damit werden auch ${betroffen} Urlaubseintrag(e) gelöscht.` : "";
    if (!window.confirm(`"${name}" wirklich löschen?${hint}`)) return;
    try {
      const res = await fetch(`/api/personen/${id}`, { method: "DELETE" });
      // 404: schon gelöscht (z. B. Doppelklick) – Ziel erreicht
      if (res.status !== 404) await readJson(res);
      setPersonen((prev) => prev.filter((p) => p.id !== id));
      setUrlaube((prev) => prev.filter((v) => v.personId !== id));
      setPersonDialog(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Person konnte nicht gelöscht werden");
    }
  }

  async function saveVacation(
    data: { personId: string; startDate: string; endDate: string; halfDay: boolean; note: string },
    existing: Vacation | null
  ) {
    try {
      if (existing) {
        const updated = await readJson(
          await fetch(`/api/urlaube/${existing.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
          })
        );
        setUrlaube((prev) => prev.map((v) => (v.id === updated.id ? updated : v)));
      } else {
        const created = await readJson(
          await fetch("/api/urlaube", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
          })
        );
        setUrlaube((prev) => [...prev, created]);
      }
      setVacationDialog(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Urlaub konnte nicht gespeichert werden");
    }
  }

  async function deleteVacation(id: string) {
    try {
      const res = await fetch(`/api/urlaube/${id}`, { method: "DELETE" });
      // 404: schon gelöscht (z. B. Doppelklick) – Ziel erreicht
      if (res.status !== 404) await readJson(res);
      setUrlaube((prev) => prev.filter((v) => v.id !== id));
      setVacationDialog(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Urlaub konnte nicht gelöscht werden");
    }
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[1400px] flex-col gap-4 p-4 sm:p-6">
      <header className="no-print flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <CalendarDays className="text-[var(--accent)]" size={22} />
            <div className="flex items-baseline gap-2 font-plex">
              <a
                href="https://lx-labs.dev"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded border border-[var(--accent)]/40 bg-[var(--accent-soft)] px-1.5 py-0.5 text-[11px] font-semibold leading-none tracking-tight text-[var(--accent)] transition-colors hover:border-[var(--accent)]"
              >
                lx-labs.dev
              </a>
              <h1 className="text-lg font-semibold tracking-tight">Urlaubsplanung</h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <UpdateAnzeige
              sperrGrund={
                importOpen
                  ? "Während eines Imports kann kein Update installiert werden."
                  : personDialog || vacationDialog
                    ? "Bitte zuerst den offenen Dialog speichern oder schließen."
                    : null
              }
            />
            <BundeslandSelect value={bundesland ?? "BW"} onChange={updateBundesland} />
            <DataMenu onImport={() => setImportOpen(true)} onError={setError} />
            <PrintButton />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-[var(--border)] bg-[var(--surface)]">
              <button
                onClick={() => setAnchor((a) => shiftAnchor(viewMode, a, -1))}
                className="p-2 text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => setAnchor(new Date())}
                className="border-x border-[var(--border)] px-3 text-sm text-[var(--text)] hover:bg-[var(--surface-hover)] cursor-pointer"
              >
                Heute
              </button>
              <button
                onClick={() => setAnchor((a) => shiftAnchor(viewMode, a, 1))}
                className="p-2 text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer"
              >
                <ChevronRight size={16} />
              </button>
            </div>
            <span className="min-w-[10ch] text-sm font-medium capitalize text-[var(--text)]">
              {rangeLabel(viewMode, anchor)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <ViewSwitcher value={viewMode} onChange={setViewMode} />
            <button
              onClick={() => setPersonDialog({ person: null })}
              className="flex h-9 items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 text-sm font-medium text-[#03202c] hover:bg-[var(--accent-strong)] cursor-pointer"
            >
              <Plus size={15} />
              Person
            </button>
          </div>
        </div>
      </header>

      {error && (
        <div className="no-print flex items-start gap-2 rounded-lg border border-[var(--danger)]/30 bg-[var(--danger)]/10 px-3 py-2 text-sm text-[var(--danger)]">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-xs underline cursor-pointer">
            Schließen
          </button>
        </div>
      )}

      {ferienFailed && (
        <div className="no-print flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--text-muted)]">
          <AlertTriangle size={14} className="shrink-0 text-[var(--holiday-text)]" />
          Schulferien-Daten konnten nicht geladen werden (Datenquelle nicht erreichbar).
        </div>
      )}

      <div className="print-only mb-2 hidden text-lg font-semibold capitalize">
        Urlaubsplanung · {rangeLabel(viewMode, anchor)} · {bundeslandName(bundesland ?? "BW")}
      </div>

      {!loading && personen.length > 0 && (
        <div className="no-print flex flex-wrap items-center gap-2">
          {personen.map((p) => (
            <button
              key={p.id}
              onClick={() => setPersonDialog({ person: p })}
              className="group flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] py-1 pl-1 pr-2.5 text-xs text-[var(--text)] hover:border-[var(--text-faint)] cursor-pointer"
            >
              <span
                className="flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-semibold text-[#04121b]"
                style={{ background: p.color }}
              >
                {personInitials(p.name)}
              </span>
              {p.name}
              {p.isStudent && (
                <span className="rounded-full bg-[var(--accent-soft)] px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-[var(--accent)]">
                  Schüler
                </span>
              )}
              <Pencil size={11} className="text-[var(--text-faint)] opacity-0 group-hover:opacity-100" />
            </button>
          ))}
        </div>
      )}

      {!loading && personen.length > 0 && (
        <VacationBalance personen={personen} urlaube={yearUrlaube} feiertage={yearHolidays} year={year} />
      )}

      {loading ? (
        <div className="flex flex-1 items-center justify-center text-sm text-[var(--text-muted)]">
          Lädt…
        </div>
      ) : personen.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[var(--border)] py-16 text-center">
          <p className="text-sm text-[var(--text-muted)]">Noch keine Personen angelegt.</p>
          <button
            onClick={() => setPersonDialog({ person: null })}
            className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-[#03202c] hover:bg-[var(--accent-strong)] cursor-pointer"
          >
            <Plus size={15} />
            Erste Person hinzufügen
          </button>
        </div>
      ) : (
        <CalendarGrid
          viewMode={viewMode}
          start={start}
          end={end}
          personen={personen}
          urlaube={urlaube}
          feiertage={feiertage}
          ferien={ferien}
          onDayClick={(rangeStart, rangeEnd) =>
            setVacationDialog({
              initialPersonId: personen[0].id,
              vacation: null,
              startDate: rangeStart,
              endDate: rangeEnd,
            })
          }
          onVacationClick={(v) => setVacationDialog({ initialPersonId: v.personId, vacation: v })}
        />
      )}

      <div className="no-print flex flex-wrap items-center gap-4 text-xs text-[var(--text-muted)]">
        <Legend swatch="var(--holiday-bg)" border="var(--holiday-text)" label="Gesetzlicher Feiertag" />
        <Legend swatch="var(--ferien-bg)" border="var(--ferien-text)" label="Schulferien" />
        <Legend swatch="var(--weekend-bg)" border="var(--weekend-text)" label="Wochenende" />
      </div>

      {personDialog && (
        <PersonDialog
          person={personDialog.person}
          onClose={() => setPersonDialog(null)}
          onSave={(data) => savePerson(data, personDialog.person)}
          onDelete={
            personDialog.person
              ? () => deletePerson(personDialog.person!.id, personDialog.person!.name)
              : undefined
          }
        />
      )}

      {vacationDialog && (
        <VacationDialog
          personen={personen}
          initialPersonId={vacationDialog.initialPersonId}
          vacation={vacationDialog.vacation}
          defaultStartDate={vacationDialog.startDate}
          defaultEndDate={vacationDialog.endDate}
          onClose={() => setVacationDialog(null)}
          onSave={(data) => saveVacation(data, vacationDialog.vacation)}
          onDelete={
            vacationDialog.vacation
              ? () => deleteVacation(vacationDialog.vacation!.id)
              : undefined
          }
        />
      )}

      {importOpen && (
        <ImportDialog
          onClose={() => setImportOpen(false)}
          onImported={() => setDataVersion((v) => v + 1)}
        />
      )}
    </div>
  );
}

function Legend({ swatch, border, label }: { swatch: string; border?: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="h-3 w-3 rounded-sm border"
        style={{ background: swatch, borderColor: border ?? "var(--border)" }}
      />
      {label}
    </span>
  );
}
