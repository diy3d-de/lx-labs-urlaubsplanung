"use client";

// Update-Anzeige der Desktop-App für die Kopfzeile: Status, „Nach Updates suchen“, „Update v… bereit“ und
// das Fenster „Version … installieren“ mit Release-Notes. Im Browser (Web/Docker) fehlt window.appUpdate,
// dann erscheint nichts.
import { useEffect, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import type { UpdateStatus } from "@/lib/appUpdate";
import { gliedereNotes } from "@/lib/releaseNotes";

function formatDatumZeit(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : `${d.toLocaleDateString("de-DE")} ${d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}`;
}

const KNOPF =
  "flex h-9 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer";

/**
 * sperrGrund: Grund, warum gerade nicht installiert werden darf (offener Dialog, laufender Import).
 * Ein abgeschlossener Vorgang darf hier nicht mehr sperren.
 */
export default function UpdateAnzeige({ sperrGrund = null }: { sperrGrund?: string | null }) {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [dialogOffen, setDialogOffen] = useState(false);
  const [installFehler, setInstallFehler] = useState<string | null>(null);
  const [installiert, setInstalliert] = useState(false);

  useEffect(() => {
    const api = window.appUpdate;
    if (!api) return;
    // Ein bereits eingetroffenes Status-Event ist neuer als die Antwort auf getStatus
    let eventErhalten = false;
    const abmelden = api.onStatus((s) => {
      eventErhalten = true;
      setStatus(s);
    });
    void api.getStatus().then((s) => {
      if (!eventErhalten) setStatus(s);
    });
    return abmelden;
  }, []);

  // Scheitert die Installation, meldet der Hauptprozess einen Fehler - dann darf der Knopf nicht gesperrt bleiben
  const phase = status?.phase;
  const [letztePhase, setLetztePhase] = useState(phase);
  if (phase !== letztePhase) {
    setLetztePhase(phase);
    if (phase !== "bereit") setInstalliert(false);
  }

  if (!status || status.phase === "deaktiviert") return null;

  async function installieren() {
    setInstallFehler(null);
    const ergebnis = await window.appUpdate!.install();
    if (ergebnis.ok) setInstalliert(true);
    else setInstallFehler(ergebnis.grund);
  }

  if (status.phase === "pruefe") {
    return <span className="text-xs text-[var(--text-faint)]">Suche nach Updates …</span>;
  }

  if (status.phase === "laedt") {
    return (
      <span className="text-xs text-[var(--text-muted)]">
        Update v{status.version} wird geladen … {status.prozent} %
      </span>
    );
  }

  if (status.phase === "bereit") {
    const gesperrt = sperrGrund !== null || installiert;
    return (
      <div className="relative">
        <button
          type="button"
          onClick={() => setDialogOffen((o) => !o)}
          className="flex h-9 items-center gap-1.5 rounded-lg border border-emerald-400 px-3 text-xs font-semibold text-emerald-400 hover:bg-emerald-400/10 cursor-pointer"
        >
          <Download size={14} />
          Update v{status.version} bereit
        </button>
        {dialogOffen && (
          <div
            role="dialog"
            aria-label={`Update auf Version ${status.version}`}
            className="absolute right-0 top-[calc(100%+8px)] z-50 flex w-[420px] max-w-[90vw] flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-2xl"
          >
            <div className="text-sm font-semibold text-[var(--text)]">Version {status.version} installieren</div>
            <ReleaseNotesBox version={status.version} notes={status.releaseNotes} />
            <p className="m-0 text-xs text-[var(--text-muted)]">
              lx-urlaubsplanung wird beendet, das Update installiert und die Anwendung neu gestartet. Gespeicherte
              Daten und Einstellungen bleiben erhalten.
            </p>
            {(sperrGrund || installFehler) && (
              <p className="m-0 text-xs text-amber-400">{sperrGrund ?? installFehler}</p>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setDialogOffen(false)} className={KNOPF}>
                Später
              </button>
              <button
                type="button"
                disabled={gesperrt}
                onClick={() => void installieren()}
                className="h-9 rounded-lg bg-[var(--accent)] px-3 text-xs font-semibold text-[#03202c] hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
              >
                {installiert ? "Wird neu gestartet …" : "Jetzt neu starten und installieren"}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Offline ist oft ein Normalzustand: neutral statt gelber Warnung.
  const warnung = status.phase === "fehler" && status.art !== "offline";
  return (
    <button
      type="button"
      onClick={() => void window.appUpdate!.check()}
      title={
        status.phase === "fehler"
          ? `Letzte Update-Prüfung fehlgeschlagen: ${status.meldung}`
          : status.phase === "aktuell"
            ? `Aktuell – zuletzt geprüft ${formatDatumZeit(status.geprueftAm)}`
            : "Auf GitHub nach einer neueren Version suchen"
      }
      className={`${KNOPF} ${warnung ? "!border-amber-400 !text-amber-400" : ""}`}
    >
      <RefreshCw size={13} />
      {status.phase === "fehler"
        ? status.art === "offline"
          ? "Update: keine Verbindung"
          : status.art === "zugang"
            ? "Update: Server prüfen"
            : "Update-Prüfung fehlgeschlagen"
        : "Nach Updates suchen"}
    </button>
  );
}

/** Release-Notes im Update-Fenster: Kasten mit Kennzeile, Abschnitte mit Aufzählungspunkten (nur Text). */
function ReleaseNotesBox({ version, notes }: { version: string; notes: string | null }) {
  const abschnitte = notes ? gliedereNotes(notes, version) : [];
  return (
    <div className="flex max-h-[300px] flex-col gap-1.5 overflow-y-auto rounded-lg border border-[var(--border-soft)] bg-[var(--bg)] px-2.5 py-2">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-faint)]">
        Neu in Version {version}
      </span>
      {abschnitte.length === 0 ? (
        <span className="text-xs text-[var(--text-faint)]">Für diese Version sind keine Release-Notes hinterlegt.</span>
      ) : (
        abschnitte.map((a, i) => (
          <div key={i} className="flex flex-col gap-0.5">
            {a.titel && <span className="text-xs font-semibold text-[var(--text)]">{a.titel}</span>}
            {a.zeilen.some((z) => z.art === "punkt") ? (
              <ul className="m-0 flex list-disc flex-col gap-0.5 pl-4">
                {a.zeilen.map((z, k) => (
                  <li
                    key={k}
                    className={`text-xs leading-relaxed text-[var(--text-muted)] ${z.art === "text" ? "-ml-4 list-none" : ""}`}
                  >
                    {z.text}
                  </li>
                ))}
              </ul>
            ) : (
              a.zeilen.map((z, k) => (
                <p key={k} className="m-0 text-xs leading-relaxed text-[var(--text-muted)]">
                  {z.text}
                </p>
              ))
            )}
          </div>
        ))
      )}
    </div>
  );
}
