// Bereitet build/ für Electron vor: Standalone-Server, statische Dateien, Migrationen.
// better-sqlite3 13 bringt Node-API-Prebuilds mit, die auch unter Electron laufen (kein Rebuild nötig).
// Übernimmt außerdem die Version aus package.json in electron/package.json (App-Verzeichnis für electron-builder).
import fs from "node:fs";

const { version } = JSON.parse(fs.readFileSync("package.json", "utf8"));
const appPkgPath = "electron/package.json";
const appPkg = JSON.parse(fs.readFileSync(appPkgPath, "utf8"));
if (appPkg.version !== version) {
  appPkg.version = version;
  fs.writeFileSync(appPkgPath, JSON.stringify(appPkg, null, 2) + "\n");
  console.log(`electron/package.json auf Version ${version} gesetzt`);
}
if (!fs.existsSync("electron/node_modules/electron-updater")) {
  console.error("electron/node_modules fehlt - zuerst `npm run desktop:deps` ausführen");
  process.exit(1);
}

fs.rmSync("build", { recursive: true, force: true });
fs.cpSync(".next/standalone", "build/standalone", { recursive: true });
fs.cpSync(".next/static", "build/standalone/.next/static", { recursive: true });
if (fs.existsSync("public")) fs.cpSync("public", "build/standalone/public", { recursive: true });
fs.cpSync("prisma/migrations", "build/migrations", { recursive: true });
// lokale Entwicklungs- und Testdaten nie ausliefern
for (const f of fs.readdirSync("build/standalone")) {
  if (f.startsWith(".env")) fs.rmSync(`build/standalone/${f}`, { force: true });
}
if (fs.existsSync("build/standalone/prisma")) {
  for (const f of fs.readdirSync("build/standalone/prisma")) {
    if (/\.db(-journal|-wal|-shm)?$/.test(f)) fs.rmSync(`build/standalone/prisma/${f}`, { force: true });
  }
}
console.log("build/ vorbereitet");
