// Automatische Updates im Hauptprozess (electron-updater, NSIS, öffentliche GitHub-Releases):
// Statusmodell, Prüfen, Download, Installation nur per Klick, Neustart-Wächter, Log.
// electron und electron-updater werden erst in initUpdater geladen, damit die Tests diese Datei
// mit normalem Node laden können (Neustart-Wächter-Skript).
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { notesAlsText } = require("./releaseNotesKern.cjs");
const { klassifiziereUpdateFehler, updateFehlerText } = require("./updateFehlerKern.cjs");
const {
  ERSTE_PRUEFUNG_NACH_MS,
  NEUSTART_EXE_VARIABLE,
  PRUEF_INTERVALL_MS,
  RELEASE_OWNER,
  RELEASE_REPO,
  SETUP_PROZESS_PRAEFIX,
} = require("./updateKonfig.cjs");

/**
 * @typedef {{ phase: "deaktiviert", grund: string }
 *   | { phase: "bereitschaft" }
 *   | { phase: "pruefe" }
 *   | { phase: "aktuell", geprueftAm: string }
 *   | { phase: "laedt", version: string, prozent: number }
 *   | { phase: "bereit", version: string, releaseNotes: string | null }
 *   | { phase: "fehler", meldung: string, art: "offline" | "zugang" | "sonstige" }} UpdateStatus
 *
 * @typedef {{
 *   onStatus: (status: UpdateStatus) => void,
 *   log: (zeile: string) => void,
 *   installationGesperrt: () => string | null,
 *   vorInstallation: () => Promise<void>,
 * }} UpdaterOptionen
 */

/** @type {UpdateStatus} */
let status = { phase: "deaktiviert", grund: "Updater nicht initialisiert" };
/** @type {UpdaterOptionen | null} */
let optionen = null;
let logDatei = null;
let autoUpdater = null;
let installGestartet = false;

/** Umgebungsvariable, die die automatische Update-Prüfung abschaltet ("1"). */
const UPDATES_AUS_VARIABLE = "LX_URLAUBSPLANUNG_KEINE_UPDATES";

/** Absoluter Pfad, damit nie eine powershell.exe aus dem Arbeitsverzeichnis gestartet wird. */
const POWERSHELL = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");

function setStatus(neu) {
  status = neu;
  optionen?.onStatus(neu);
}

function zeitstempel() {
  const d = new Date();
  const z = (n, l = 2) => String(n).padStart(l, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}:${z(d.getSeconds())}`;
}

function log(zeile) {
  optionen?.log(`[update] ${zeile}`);
  if (logDatei) {
    try {
      fs.appendFileSync(logDatei, `${zeitstempel()} ${zeile}\n`);
    } catch {
      // Logging darf den Update-Ablauf nie abbrechen.
    }
  }
}

function releaseNotesAlsText(info) {
  const notes = info.releaseNotes;
  if (!notes) return null;
  return notesAlsText(typeof notes === "string" ? notes : notes.map((n) => n.note ?? "").join("\n\n"));
}

/** @param {UpdaterOptionen} opt */
function initUpdater(opt) {
  const { app } = require("electron");
  optionen = opt;
  logDatei = path.join(app.getPath("userData"), "update.log");

  if (!app.isPackaged) {
    setStatus({ phase: "deaktiviert", grund: "Updates nur in der installierten Version" });
    return;
  }
  // Abschaltbar, z. B. in Umgebungen ohne Internet oder wenn keine Verbindung zu GitHub gewünscht ist
  if (process.env[UPDATES_AUS_VARIABLE] === "1") {
    setStatus({ phase: "deaktiviert", grund: `Updates per ${UPDATES_AUS_VARIABLE}=1 abgeschaltet` });
    return;
  }

  autoUpdater = require("electron-updater").autoUpdater;
  autoUpdater.logger = {
    info: (m) => log(String(m)),
    warn: (m) => log(`WARN ${String(m)}`),
    error: (m) => log(`FEHLER ${String(m)}`),
    debug: () => {},
  };
  autoUpdater.autoDownload = true;
  // Nur auf ausdrücklichen Klick installieren, nie still beim Beenden.
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowPrerelease = false;
  autoUpdater.allowDowngrade = false;
  // Kein Web-Installer im Einsatz (nur das vollständige NSIS-Setup).
  autoUpdater.disableWebInstaller = true;
  autoUpdater.setFeedURL({ provider: "github", owner: RELEASE_OWNER, repo: RELEASE_REPO });

  autoUpdater.on("checking-for-update", () => setStatus({ phase: "pruefe" }));
  autoUpdater.on("update-not-available", () =>
    setStatus({ phase: "aktuell", geprueftAm: new Date().toISOString() }),
  );
  autoUpdater.on("update-available", (info) => setStatus({ phase: "laedt", version: info.version, prozent: 0 }));
  autoUpdater.on("download-progress", (p) => {
    if (status.phase === "laedt") setStatus({ ...status, prozent: Math.round(p.percent) });
  });
  autoUpdater.on("update-downloaded", (info) => {
    setStatus({ phase: "bereit", version: info.version, releaseNotes: releaseNotesAlsText(info) });
  });
  autoUpdater.on("error", (err) => {
    // Ein bereits heruntergeladenes Update bleibt installierbar, auch wenn eine spätere Prüfung scheitert -
    // nicht aber, wenn gerade die Installation selbst gescheitert ist (sonst hinge die Anzeige).
    if (status.phase === "bereit" && !installGestartet) {
      log(`Fehler bei erneuter Prüfung ignoriert: ${err.message}`);
      return;
    }
    installGestartet = false;
    const art = klassifiziereUpdateFehler(err.message);
    log(`Fehlerart: ${art}`);
    setStatus({ phase: "fehler", meldung: updateFehlerText(art, err.message.split("\n")[0]), art });
  });

  setStatus({ phase: "bereitschaft" });
  setTimeout(() => void suchenNachUpdates(), ERSTE_PRUEFUNG_NACH_MS);
  setInterval(() => void suchenNachUpdates(), PRUEF_INTERVALL_MS);
}

function getUpdateStatus() {
  return status;
}

async function suchenNachUpdates() {
  if (!autoUpdater) return;
  if (["deaktiviert", "pruefe", "laedt", "bereit"].includes(status.phase)) return;
  try {
    await autoUpdater.checkForUpdates();
  } catch {
    // Wird bereits über das 'error'-Event als Status gemeldet.
  }
}

/**
 * Der NSIS-Installer startet die App nach einem stillen Update per --force-run nicht verlässlich neu.
 * Deshalb ein unabhängiger, unsichtbarer Wächter: wartet, bis der Installer
 * (Prozessname <SETUP_PROZESS_PRAEFIX>-x.y.z) beendet ist, und startet die App, falls sie nicht läuft.
 * Doppelstarts verhindert zusätzlich app.requestSingleInstanceLock() im Hauptprozess.
 *
 * Der Programmpfad geht nur als Umgebungsvariable an PowerShell, nie als Teil des Skripttexts:
 * PowerShell behandelt auch typografische Anführungszeichen (’ ‘) als String-Begrenzer.
 */
const NEUSTART_WAECHTER_SKRIPT = [
  "$ErrorActionPreference = 'SilentlyContinue'",
  `$exe = $env:${NEUSTART_EXE_VARIABLE}`,
  `Remove-Item -LiteralPath 'Env:\\${NEUSTART_EXE_VARIABLE}'`,
  "if (-not $exe) { exit }",
  "$name = [IO.Path]::GetFileNameWithoutExtension($exe)",
  "Start-Sleep -Seconds 5",
  "$frist = (Get-Date).AddMinutes(5)",
  `while ((Get-Date) -lt $frist -and (Get-Process -Name '${SETUP_PROZESS_PRAEFIX}*')) { Start-Sleep -Seconds 1 }`,
  "Start-Sleep -Seconds 3",
  // Vergleich statt -Name und Process.Start statt Start-Process -FilePath:
  // beide würden Platzhalterzeichen wie [ ] im Pfad/Namen auswerten.
  "if (-not (Get-Process | Where-Object { $_.ProcessName -eq $name })) { [void][Diagnostics.Process]::Start($exe) }",
].join("\n");

function starteNeustartWaechter() {
  try {
    const env = { ...process.env, [NEUSTART_EXE_VARIABLE]: process.execPath };
    // Nie Electron-als-Node vererben (z. B. aus einer Entwicklungsumgebung)
    delete env.ELECTRON_RUN_AS_NODE;
    spawn(
      POWERSHELL,
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-WindowStyle",
        "Hidden",
        "-EncodedCommand",
        Buffer.from(NEUSTART_WAECHTER_SKRIPT, "utf16le").toString("base64"),
      ],
      { detached: true, stdio: "ignore", windowsHide: true, env },
    ).unref();
    log("Neustart-Wächter gestartet");
  } catch (err) {
    log(`Neustart-Wächter konnte nicht gestartet werden: ${err.message}`);
  }
}

/** @returns {Promise<{ ok: true } | { ok: false, grund: string }>} */
async function installiereUpdate() {
  if (status.phase !== "bereit" || !autoUpdater) return { ok: false, grund: "Kein heruntergeladenes Update vorhanden" };
  const sperre = optionen?.installationGesperrt() ?? null;
  if (sperre) return { ok: false, grund: sperre };

  log(`Installiere Version ${status.version} und starte neu`);
  installGestartet = true;
  await optionen?.vorInstallation();
  starteNeustartWaechter();
  // isSilent=true: übernimmt das bisherige Installationsverzeichnis ohne Dialoge;
  // isForceRunAfter=true: App startet danach neu (der Wächter sichert ab).
  setImmediate(() => autoUpdater.quitAndInstall(true, true));
  return { ok: true };
}

module.exports = {
  NEUSTART_EXE_VARIABLE,
  UPDATES_AUS_VARIABLE,
  NEUSTART_WAECHTER_SKRIPT,
  initUpdater,
  getUpdateStatus,
  suchenNachUpdates,
  installiereUpdate,
};
