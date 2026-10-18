import path from "node:path";

/** Pfad der SQLite-Datenbank der laufenden App (SQLITE_PATH, Standard prisma/dev.db). */
export function sqlitePath(): string {
  return process.env.SQLITE_PATH ?? path.join(process.cwd(), "prisma", "dev.db");
}
