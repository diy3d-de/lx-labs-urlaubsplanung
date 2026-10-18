// Prüft das gepackte Programm (dist/win-unpacked) vor jeder Veröffentlichung:
// 1. app.asar: Jede Abhängigkeit jedes Pakets muss über die node_modules-Kette auflösbar sein
//    (electron-builder hat schon Module unter falschem Elternpaket abgelegt - die App stürzte dann
//    erst auf dem Zielrechner ab, noch bevor der Updater laufen konnte).
// 2. Pflichtdateien von Hauptprozess, Preload, Updater und Standalone-Server.
// 3. Keine lokalen Daten (.env, *.db) im Paket.
// Aufruf nach `electron-builder --win` bzw. `--dir`.
const fs = require("node:fs");
const path = require("node:path");
const asar = require("@electron/asar");

const root = path.join(__dirname, "..");
const resources = path.join(root, "dist", "win-unpacked", "resources");
const asarPfad = path.join(resources, "app.asar");
const entpackt = asarPfad + ".unpacked";
if (!fs.existsSync(asarPfad)) {
  console.error(`Paket nicht gefunden: ${asarPfad}`);
  process.exit(1);
}

const eintraege = new Set(asar.listPackage(asarPfad).map((f) => f.replace(/\\/g, "/")));
const existiert = (p) => eintraege.has(p) || fs.existsSync(path.join(entpackt, p));
const lesePaket = (verzeichnis) => {
  const datei = `${verzeichnis}/package.json`.replace(/^\//, "");
  try {
    return JSON.parse(asar.extractFile(asarPfad, datei.split("/").join(path.sep)).toString("utf8"));
  } catch {
    const ausserhalb = path.join(entpackt, datei);
    return fs.existsSync(ausserhalb) ? JSON.parse(fs.readFileSync(ausserhalb, "utf8")) : null;
  }
};

const paketVerzeichnisse = [...eintraege]
  .filter((f) => /\/node_modules\/(@[^/]+\/)?[^/@][^/]*\/package\.json$/.test(f))
  .map((f) => f.slice(0, -"/package.json".length))
  .filter((v) => /\/node_modules\/(@[^/]+\/)?[^/]+$/.test(v));

function findeAbhaengigkeit(vonVerzeichnis, name) {
  let dir = vonVerzeichnis;
  for (;;) {
    if (existiert(`${dir}/node_modules/${name}/package.json`)) return true;
    if (dir === "" || dir === "/") return false;
    const idx = dir.lastIndexOf("/node_modules/");
    dir = idx >= 0 ? dir.slice(0, idx) : "";
  }
}

const fehler = [];
const pruefe = (verzeichnis, pkg) => {
  for (const name of Object.keys(pkg.dependencies ?? {})) {
    if (name.startsWith("@types/")) continue;
    if (!findeAbhaengigkeit(verzeichnis, name)) fehler.push(`${verzeichnis || "(App)"} -> ${name}`);
  }
};

const app = lesePaket("");
if (!app) {
  console.error("package.json der App fehlt im Paket");
  process.exit(1);
}
pruefe("", app);
for (const v of paketVerzeichnisse) {
  const pkg = lesePaket(v);
  if (pkg) pruefe(v, pkg);
  else fehler.push(`${v}: package.json nicht lesbar`);
}

for (const pflicht of ["/main.cjs", "/preload.cjs", "/updater.cjs", "/updateKonfig.cjs", "/updateFehlerKern.cjs", "/releaseNotesKern.cjs", "/node_modules/electron-updater/package.json"]) {
  if (!existiert(pflicht)) fehler.push(`app.asar: ${pflicht} fehlt`);
}

// Standalone-Server (extraResources + afterPack)
for (const pflicht of [
  "app-update.yml",
  "standalone/server.js",
  "standalone/.next/static",
  "standalone/node_modules/next/package.json",
  "standalone/node_modules/better-sqlite3/prebuilds/win32-x64.node",
  "standalone/node_modules/.prisma/client",
  "migrations",
]) {
  if (!fs.existsSync(path.join(resources, pflicht))) fehler.push(`resources/${pflicht} fehlt`);
}
for (const f of fs.readdirSync(path.join(resources, "standalone"))) {
  if (f.startsWith(".env")) fehler.push(`resources/standalone/${f} darf nicht ausgeliefert werden`);
}
const prismaDir = path.join(resources, "standalone", "prisma");
if (fs.existsSync(prismaDir)) {
  for (const f of fs.readdirSync(prismaDir)) if (/\.db/.test(f)) fehler.push(`resources/standalone/prisma/${f} darf nicht ausgeliefert werden`);
}

if (fehler.length > 0) {
  console.error(`Im Paket fehlen ${fehler.length} Bestandteile bzw. es ist etwas zu viel drin:`);
  for (const f of fehler) console.error(`  ${f}`);
  process.exit(1);
}
console.log(`Paket in Ordnung: ${paketVerzeichnisse.length} Pakete im asar, alle Abhängigkeiten auflösbar, Server vollständig.`);
