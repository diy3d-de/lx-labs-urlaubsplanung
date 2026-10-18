// Tests für Fehlereinordnung, Release-Notes und Neustart-Wächter (node:test, keine Abhängigkeiten).
// Start: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { gliedereNotes } from "../src/lib/releaseNotes.ts";

const require = createRequire(import.meta.url);
const { klassifiziereUpdateFehler, updateFehlerText } = require("../electron/updateFehlerKern.cjs");
const { notesAlsText } = require("../electron/releaseNotesKern.cjs");
const upd = require("../electron/updater.cjs");
const konfig = require("../electron/updateKonfig.cjs");

// ---------------------------------------------------------------- Konfiguration
test("Installer-Präfix passt zu nsis.artifactName", () => {
  const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(pkg.build.nsis.artifactName, `${konfig.SETUP_PROZESS_PRAEFIX}-\${version}.\${ext}`);
  assert.equal(pkg.build.publish.owner, konfig.RELEASE_OWNER);
  assert.equal(pkg.build.publish.repo, konfig.RELEASE_REPO);
  assert.doesNotMatch(konfig.SETUP_PROZESS_PRAEFIX, /\s/);
});

// ---------------------------------------------------------------- Fehlereinordnung
test("Kein Internet wird als offline erkannt", () => {
  for (const m of [
    "getaddrinfo ENOTFOUND api.github.com",
    "net::ERR_INTERNET_DISCONNECTED",
    "connect ETIMEDOUT 140.82.121.5:443",
    "read ECONNRESET",
    "Error: socket hang up",
  ]) {
    assert.equal(klassifiziereUpdateFehler(m), "offline", m);
  }
});

test("Ablehnung durch GitHub und fehlendes Release werden als Zugangsfehler erkannt", () => {
  for (const m of [
    "Cannot find latest release: HTTP 404 Not Found",
    "HTTP 403 Forbidden",
    "API rate limit exceeded",
    "HttpError: 429",
    "Error: No published versions on GitHub",
    "Cannot find latest.yml in the latest release artifacts",
  ]) {
    assert.equal(klassifiziereUpdateFehler(m), "zugang", m);
  }
});

test("Anderes bleibt unverändert; Texte nennen die Ursache", () => {
  assert.equal(klassifiziereUpdateFehler("sha512 checksum mismatch"), "sonstige");
  assert.equal(updateFehlerText("sonstige", "sha512 checksum mismatch"), "sha512 checksum mismatch");
  assert.match(updateFehlerText("offline", "x"), /Keine Verbindung/);
  assert.match(updateFehlerText("zugang", "x"), /GitHub/);
});

// ---------------------------------------------------------------- Release-Notes
const NOTES = `lx-urlaubsplanung 1.4.0

Neu
- Erste neue Funktion mit etwas längerem Text.
- Zweite neue Funktion.

Geändert
- Geändertes Verhalten.

Hinweis
- Was beim Update zu beachten ist.`;

test("Release-Notes: Abschnitte mit Punkten, Titelzeile entfällt", () => {
  const a = gliedereNotes(NOTES, "1.4.0");
  assert.deepEqual(
    a.map((x) => x.titel),
    ["Neu", "Geändert", "Hinweis"]
  );
  assert.equal(a[0].zeilen.length, 2);
  assert.ok(a[0].zeilen.every((z) => z.art === "punkt"));
});

test("Release-Notes: Fließtext, Markdown-Überschrift, kurzer Satz ohne Punkt", () => {
  assert.deepEqual(gliedereNotes("Kleine Korrekturen an der Anzeige."), [
    { titel: null, zeilen: [{ art: "text", text: "Kleine Korrekturen an der Anzeige." }] },
  ]);
  assert.equal(gliedereNotes("## **Behoben**\n* Absturz beim Start")[0].titel, "Behoben");
  assert.deepEqual(gliedereNotes("Nur Fehlerbehebungen"), [
    { titel: null, zeilen: [{ art: "text", text: "Nur Fehlerbehebungen" }] },
  ]);
});

test("Release-Notes: HTML aus dem GitHub-Feed wird zu Text, leere Notes sind null", () => {
  assert.equal(notesAlsText("<h2>Neu</h2><ul><li>A &amp; B</li></ul>"), "Neu\n- A & B");
  assert.equal(notesAlsText("<script>alert(1)</script>Text"), "alert(1)Text");
  assert.equal(notesAlsText("   "), null);
  assert.equal(notesAlsText(null), null);
});

// ---------------------------------------------------------------- Neustart-Wächter (Windows)
// Pfad voller Sonderzeichen, der bei Interpolation in den Skripttext Code einschleusen würde.
// Gestartet wird statt der App eine .cmd-Datei, die nur eine Markerdatei schreibt.
function powershell(skript, env, cwd) {
  return spawnSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", Buffer.from(skript, "utf16le").toString("base64")],
    { encoding: "utf8", cwd, env: { ...process.env, ...env }, windowsHide: true, timeout: 60_000 }
  );
}

async function warteBis(bedingung, ms) {
  const ende = Date.now() + ms;
  while (Date.now() < ende) {
    if (bedingung()) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("Zeitüberschreitung");
}

const nurWindows = { skip: process.platform !== "win32" && "nur Windows" };

test("Neustart-Wächter: Pfad mit ’ ‘ ' [ ] ; wird nicht ausgeführt, sondern korrekt gestartet", nurWindows, async (t) => {
  const basis = fs.mkdtempSync(path.join(os.tmpdir(), "neustart-"));
  t.after(() => fs.promises.rm(basis, { recursive: true, force: true }));
  const ordner = path.join(basis, "O Brien x’; New-Item -Path INJIZIERT.txt -ItemType File; ‘ [a] 'b' y");
  fs.mkdirSync(ordner, { recursive: true });
  const exe = path.join(ordner, "Testziel [1].cmd");
  fs.writeFileSync(exe, '@echo gestartet> "%~dp0marker.txt"\r\n');

  assert.ok(!upd.NEUSTART_WAECHTER_SKRIPT.includes(ordner), "Pfad steht nicht im Skript");
  const skript = upd.NEUSTART_WAECHTER_SKRIPT.replace(/Start-Sleep -Seconds \d+/g, "$null = 0");
  const r = powershell(skript, { [upd.NEUSTART_EXE_VARIABLE]: exe }, basis);
  assert.equal(r.status, 0, r.stderr);
  await warteBis(() => fs.existsSync(path.join(ordner, "marker.txt")), 15_000);
  assert.ok(
    !fs.existsSync(path.join(basis, "INJIZIERT.txt")) && !fs.existsSync(path.join(ordner, "INJIZIERT.txt")),
    "kein eingeschleuster Befehl ausgeführt"
  );
});

test("Neustart-Wächter ohne Programmpfad beendet sich ohne Aktion", nurWindows, (t) => {
  const basis = fs.mkdtempSync(path.join(os.tmpdir(), "neustart-leer-"));
  t.after(() => fs.promises.rm(basis, { recursive: true, force: true }));
  const r = powershell(upd.NEUSTART_WAECHTER_SKRIPT, { [upd.NEUSTART_EXE_VARIABLE]: "" }, basis);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(fs.readdirSync(basis), []);
});
