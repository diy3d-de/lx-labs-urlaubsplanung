// Typen der Preload-Brücke window.appUpdate (nur in der Desktop-App vorhanden, siehe electron/preload.cjs).
// Muss zum Statusmodell in electron/updater.cjs passen.

export type UpdateStatus =
  | { phase: "deaktiviert"; grund: string }
  | { phase: "bereitschaft" }
  | { phase: "pruefe" }
  | { phase: "aktuell"; geprueftAm: string }
  | { phase: "laedt"; version: string; prozent: number }
  | { phase: "bereit"; version: string; releaseNotes: string | null }
  | { phase: "fehler"; meldung: string; art: "offline" | "zugang" | "sonstige" };

export interface AppUpdateApi {
  getStatus: () => Promise<UpdateStatus | null>;
  check: () => Promise<void>;
  install: () => Promise<{ ok: true } | { ok: false; grund: string }>;
  onStatus: (callback: (status: UpdateStatus) => void) => () => void;
}

declare global {
  interface Window {
    appUpdate?: AppUpdateApi;
  }
}
