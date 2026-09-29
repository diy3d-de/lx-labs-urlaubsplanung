import {
  assertBoolean,
  assertBundesland,
  assertColor,
  assertDateRange,
  assertDateString,
  assertName,
  assertNote,
  assertVacationDays,
  isObject,
  ValidationError,
} from "./validate";

export const BACKUP_APP = "lx-urlaubsplanung";
export const BACKUP_VERSION = 1;

// Einziges Mengenlimit; Inhalte prüfen dieselben Regeln wie beim normalen Speichern
export const MAX_IMPORT_BYTES = 2_000_000;

export interface BackupVacation {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  halfDay: boolean;
  note: string | null;
}

export interface BackupPerson {
  name: string;
  isStudent: boolean;
  color: string | null;
  vacationDays: number;
  heiligabendHalf: boolean;
  silvesterHalf: boolean;
  urlaube: BackupVacation[];
}

export interface Backup {
  app: typeof BACKUP_APP;
  version: typeof BACKUP_VERSION;
  exportedAt: string | null;
  settings: { bundesland: string };
  personen: BackupPerson[];
}

export type ImportMode = "merge" | "replace";

export interface ImportResult {
  personenNeu: number;
  urlaubeNeu: number;
  urlaubeUebersprungen: number;
}

/** Fehlermeldungen mit Fundstelle versehen, z. B. „Anna, Urlaub 3: …“. */
function at<T>(where: string, check: () => T): T {
  try {
    return check();
  } catch (err) {
    if (err instanceof ValidationError) throw new ValidationError(`${where}: ${err.message}`);
    throw err;
  }
}

function colorOrNull(value: unknown): string | null {
  try {
    return assertColor(value);
  } catch {
    return null;
  }
}

function parsePerson(p: unknown, index: number): BackupPerson {
  if (!isObject(p)) throw new ValidationError(`Person ${index + 1}: ungültiger Eintrag`);
  const name = at(`Person ${index + 1}`, () => assertName(p.name));
  if (!Array.isArray(p.urlaube)) throw new ValidationError(`${name}: Urlaubsliste fehlt`);

  return at(name, () => ({
    name,
    isStudent: p.isStudent === true,
    color: colorOrNull(p.color),
    // Fehlende Felder bekommen die Standardwerte der App
    vacationDays: p.vacationDays === undefined ? 30 : assertVacationDays(p.vacationDays),
    heiligabendHalf: p.heiligabendHalf === undefined ? true : assertBoolean(p.heiligabendHalf, "24.12. halber Tag"),
    silvesterHalf: p.silvesterHalf === undefined ? true : assertBoolean(p.silvesterHalf, "31.12. halber Tag"),
    urlaube: (p.urlaube as unknown[]).map((v, j) =>
      at(`Urlaub ${j + 1}`, () => {
        if (!isObject(v)) throw new ValidationError("ungültiger Eintrag");
        const startDate = assertDateString(v.startDate, "Startdatum");
        const endDate = assertDateString(v.endDate, "Enddatum");
        assertDateRange(startDate, endDate);
        // wie beim Speichern: halber Tag nur bei Einzeltagen
        return { startDate, endDate, halfDay: startDate === endDate && v.halfDay === true, note: assertNote(v.note) };
      })
    ),
  }));
}

type ParseResult = { ok: true; data: Backup } | { ok: false; error: string };

/** Validiert eine Export-Datei. Wird im Browser (Vorschau) und auf dem Server (verbindlich) genutzt. */
export function parseBackup(raw: unknown): ParseResult {
  try {
    if (!isObject(raw) || raw.app !== BACKUP_APP) {
      throw new ValidationError("Die Datei ist kein Export der Urlaubsplanung");
    }
    if (raw.version !== BACKUP_VERSION) throw new ValidationError("Nicht unterstützte Export-Version");
    const bundesland = assertBundesland(isObject(raw.settings) ? raw.settings.bundesland : undefined);
    if (!Array.isArray(raw.personen)) throw new ValidationError("Personenliste fehlt");

    return {
      ok: true,
      data: {
        app: BACKUP_APP,
        version: BACKUP_VERSION,
        exportedAt: typeof raw.exportedAt === "string" ? raw.exportedAt : null,
        settings: { bundesland },
        personen: raw.personen.map(parsePerson),
      },
    };
  } catch (err) {
    if (err instanceof ValidationError) return { ok: false, error: err.message };
    throw err;
  }
}
