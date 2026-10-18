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

/**
 * Abgleich mit der Mobile-App (POST /api/sync).
 *
 * Der Server führt einen globalen Änderungszähler; jede Person, jeder Urlaub und die Einstellungen tragen
 * die rev ihrer letzten Änderung, Löschungen landen als Tombstone (alles per SQLite-Trigger). Ein Client
 * schickt seine offenen Änderungen mit und bekommt alles mit rev > cursor zurück.
 *
 * - Jede gesendete Änderung nennt die rev, auf der sie beruht (baseRev, 0 = neu). Wurde der Datensatz auf dem
 *   Server seitdem geändert, gewinnt der Server: Ablehnung „Konflikt“, der Serverstand kommt in der Antwort mit.
 * - Löschungen gewinnen immer; gelöschte IDs werden nicht wiederbelebt.
 * - dbId kennzeichnet die Server-Datenbank. Passt sie nicht (anderer Server, neu angelegte Datenbank) oder ist
 *   der cursor größer als der Zähler, übernimmt der Server nichts und antwortet mit reset: true und allen Daten.
 *   dbId null = erster Kontakt: Änderungen werden übernommen, cursor muss 0 sein.
 * - Personen müssen spätestens im selben Abgleich wie ihre Urlaube gesendet werden.
 */

export type SyncEntity = "person" | "vacation";

export interface SyncPerson {
  id: string;
  name: string;
  isStudent: boolean;
  color: string;
  order: number;
  vacationDays: number;
  heiligabendHalf: boolean;
  silvesterHalf: boolean;
}

export interface SyncVacation {
  id: string;
  personId: string;
  startDate: string;
  endDate: string;
  halfDay: boolean;
  note: string | null;
}

export interface SyncSettings {
  bundesland: string;
}

type WithBase<T> = T & { baseRev: number };

export interface SyncRequest {
  dbId: string | null;
  cursor: number;
  personen: WithBase<SyncPerson>[];
  urlaube: WithBase<SyncVacation>[];
  deleted: { entity: SyncEntity; id: string }[];
  settings: WithBase<SyncSettings> | null;
}

export interface SyncResponse {
  dbId: string;
  cursor: number;
  /** true: Client muss seinen Bestand durch die gelieferten Daten ersetzen (eigene Änderungen wurden nicht übernommen) */
  reset: boolean;
  personen: (SyncPerson & { rev: number })[];
  urlaube: (SyncVacation & { rev: number })[];
  deleted: { entity: SyncEntity; id: string }[];
  settings: (SyncSettings & { rev: number }) | null;
  /** Nicht übernommene Änderungen des Clients; bei „Konflikt“ steckt der Serverstand in personen/urlaube/settings */
  rejected: { entity: SyncEntity | "settings"; id: string; reason: string }[];
}

// Obergrenze je Anfrage; ein Client mit mehr offenen Änderungen synchronisiert in mehreren Durchgängen
export const MAX_SYNC_ITEMS = 2000;
export const MAX_SYNC_BYTES = 1_000_000;

// cuid vom Server oder UUID vom Mobilgerät
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const DB_ID_RE = /^[0-9a-f]{32}$/;

function assertId(value: unknown, field = "id"): string {
  if (typeof value !== "string" || !ID_RE.test(value)) throw new ValidationError(`${field} ungültig`);
  return value;
}

function assertRev(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new ValidationError(`${field} ungültig`);
  }
  return value;
}

function assertList(value: unknown, field: string): unknown[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new ValidationError(`${field} muss eine Liste sein`);
  return value;
}

function parsePerson(p: unknown): WithBase<SyncPerson> {
  if (!isObject(p)) throw new ValidationError("Person: ungültiger Eintrag");
  const order = p.order;
  if (typeof order !== "number" || !Number.isInteger(order) || order < 0 || order > 1_000_000) {
    throw new ValidationError("Person: Reihenfolge ungültig");
  }
  return {
    id: assertId(p.id),
    name: assertName(p.name),
    isStudent: assertBoolean(p.isStudent, "Schüler"),
    color: assertColor(p.color),
    order,
    vacationDays: assertVacationDays(p.vacationDays),
    heiligabendHalf: assertBoolean(p.heiligabendHalf, "24.12. halber Tag"),
    silvesterHalf: assertBoolean(p.silvesterHalf, "31.12. halber Tag"),
    baseRev: assertRev(p.baseRev, "baseRev"),
  };
}

function parseVacation(v: unknown): WithBase<SyncVacation> {
  if (!isObject(v)) throw new ValidationError("Urlaub: ungültiger Eintrag");
  const startDate = assertDateString(v.startDate, "Startdatum");
  const endDate = assertDateString(v.endDate, "Enddatum");
  assertDateRange(startDate, endDate);
  return {
    id: assertId(v.id),
    personId: assertId(v.personId, "personId"),
    startDate,
    endDate,
    // wie beim normalen Speichern: halber Tag nur bei Einzeltagen
    halfDay: startDate === endDate && assertBoolean(v.halfDay, "halber Tag"),
    note: assertNote(v.note),
    baseRev: assertRev(v.baseRev, "baseRev"),
  };
}

/** Validiert die komplette Anfrage; ein ungültiger Datensatz lehnt die ganze Anfrage ab (400). */
export function parseSyncRequest(raw: unknown): SyncRequest {
  if (!isObject(raw)) throw new ValidationError("Ungültige Anfrage");
  const cursor = assertRev(raw.cursor, "cursor");
  let dbId: string | null = null;
  if (raw.dbId !== undefined && raw.dbId !== null) {
    if (typeof raw.dbId !== "string" || !DB_ID_RE.test(raw.dbId)) throw new ValidationError("dbId ungültig");
    dbId = raw.dbId;
  }
  const personen = assertList(raw.personen, "personen");
  const urlaube = assertList(raw.urlaube, "urlaube");
  const deleted = assertList(raw.deleted, "deleted");
  if (personen.length + urlaube.length + deleted.length > MAX_SYNC_ITEMS) {
    throw new ValidationError(`Höchstens ${MAX_SYNC_ITEMS} Änderungen je Abgleich`);
  }

  let settings: SyncRequest["settings"] = null;
  if (raw.settings !== undefined && raw.settings !== null) {
    if (!isObject(raw.settings)) throw new ValidationError("settings ungültig");
    settings = {
      bundesland: assertBundesland(raw.settings.bundesland),
      baseRev: assertRev(raw.settings.baseRev, "settings.baseRev"),
    };
  }

  return {
    dbId,
    cursor,
    personen: personen.map(parsePerson),
    urlaube: urlaube.map(parseVacation),
    deleted: deleted.map((d) => {
      if (!isObject(d) || (d.entity !== "person" && d.entity !== "vacation")) {
        throw new ValidationError("Löschung ungültig");
      }
      return { entity: d.entity, id: assertId(d.id) };
    }),
    settings,
  };
}
