// Bereitet build/ für Electron vor: Standalone-Server, statische Dateien, Migrationen.
// better-sqlite3 13 bringt Node-API-Prebuilds mit, die auch unter Electron laufen (kein Rebuild nötig).
import fs from "node:fs";

fs.rmSync("build", { recursive: true, force: true });
fs.cpSync(".next/standalone", "build/standalone", { recursive: true });
fs.cpSync(".next/static", "build/standalone/.next/static", { recursive: true });
if (fs.existsSync("public")) fs.cpSync("public", "build/standalone/public", { recursive: true });
fs.cpSync("prisma/migrations", "build/migrations", { recursive: true });
// lokale Entwicklungsdaten nie ausliefern
for (const f of [".env", "prisma/dev.db", "prisma/dev.db-journal"]) fs.rmSync(`build/standalone/${f}`, { force: true });
console.log("build/ vorbereitet");
