import Database from "better-sqlite3";
import { sqlitePath } from "./dbPath";
import type { SyncEntity, SyncPerson, SyncRequest, SyncResponse, SyncVacation } from "./sync";

/**
 * Führt einen Abgleich in EINER synchronen SQLite-Transaktion auf eigener Verbindung aus.
 *
 * Bewusst nicht über Prisma: Der Prisma-Adapter hat nur eine Verbindung, und Abfragen anderer Requests liefen
 * mitten in eine offene interaktive Transaktion hinein (und würden bei deren Rollback still mit verworfen).
 * Eine synchrone better-sqlite3-Transaktion kann nicht unterbrochen werden und ist für einige tausend Zeilen
 * schnell genug.
 */

export class SyncBusyError extends Error {}
export class SyncSetupError extends Error {}

const TRIGGERS = [
  "Person_rev_insert",
  "Person_rev_update",
  "Person_tombstone",
  "Vacation_rev_insert",
  "Vacation_rev_update",
  "Vacation_tombstone",
  "Settings_rev_insert",
  "Settings_rev_update",
];

const globalForSync = globalThis as unknown as { syncDb?: Database.Database };

function db(): Database.Database {
  if (!globalForSync.syncDb) {
    const conn = new Database(sqlitePath());
    // Nicht warten: Hält gerade eine andere Verbindung eine Transaktion offen, lieber 503 und später erneut,
    // als den Event-Loop zu blockieren.
    conn.pragma("busy_timeout = 0");
    conn.pragma("foreign_keys = ON");
    globalForSync.syncDb = conn;
  }
  return globalForSync.syncDb;
}

interface PersonRow {
  id: string;
  name: string;
  isStudent: number;
  color: string;
  order: number;
  vacationDays: number;
  heiligabendHalf: number;
  silvesterHalf: number;
  rev: number;
}

interface VacationRow {
  id: string;
  personId: string;
  startDate: string;
  endDate: string;
  halfDay: number;
  note: string | null;
  rev: number;
}

const toPerson = (r: PersonRow): SyncPerson & { rev: number } => ({
  id: r.id,
  name: r.name,
  isStudent: !!r.isStudent,
  color: r.color,
  order: r.order,
  vacationDays: r.vacationDays,
  heiligabendHalf: !!r.heiligabendHalf,
  silvesterHalf: !!r.silvesterHalf,
  rev: r.rev,
});

const toVacation = (r: VacationRow): SyncVacation & { rev: number } => ({
  id: r.id,
  personId: r.personId,
  startDate: r.startDate,
  endDate: r.endDate,
  halfDay: !!r.halfDay,
  note: r.note,
  rev: r.rev,
});

const PERSON_COLS = `"id","name","isStudent","color","order","vacationDays","heiligabendHalf","silvesterHalf","rev"`;
const VACATION_COLS = `"id","personId","startDate","endDate","halfDay","note","rev"`;

export function applySync(body: SyncRequest): SyncResponse {
  const conn = db();

  const run = conn.transaction((): SyncResponse => {
    const vorhanden = conn
      .prepare(`SELECT count(*) AS n FROM sqlite_master WHERE type = 'trigger' AND name IN (${TRIGGERS.map(() => "?").join(",")})`)
      .get(...TRIGGERS) as { n: number };
    if (vorhanden.n !== TRIGGERS.length) {
      throw new SyncSetupError(`Sync-Trigger fehlen (${vorhanden.n}/${TRIGGERS.length}) - Migration prüfen`);
    }

    const counter = conn.prepare(`SELECT "value", "dbId" FROM "SyncCounter" WHERE "id" = 1`).get() as
      | { value: number; dbId: string }
      | undefined;
    if (!counter || !counter.dbId) throw new SyncSetupError("SyncCounter fehlt - Migration prüfen");

    const reset = body.dbId === null ? body.cursor !== 0 : body.dbId !== counter.dbId || body.cursor > counter.value;
    const cursor = reset ? 0 : body.cursor;
    const rejected: SyncResponse["rejected"] = [];
    const forcePersons = new Set<string>();
    const forceVacations = new Set<string>();
    let forceSettings = false;

    if (!reset) {
      // 1. Löschungen des Clients (fehlende IDs sind kein Fehler; Löschungen gewinnen immer)
      const delVacation = conn.prepare(`DELETE FROM "Vacation" WHERE "id" = ?`);
      const delPerson = conn.prepare(`DELETE FROM "Person" WHERE "id" = ?`);
      for (const d of body.deleted) (d.entity === "person" ? delPerson : delVacation).run(d.id);

      const isDead = conn.prepare(`SELECT 1 FROM "Tombstone" WHERE "entity" = ? AND "id" = ?`);
      const reject = (entity: SyncEntity, id: string, reason: string) => rejected.push({ entity, id, reason });

      // 2. Personen vor Urlauben, damit neue Urlaube ihre neue Person finden
      const personRev = conn.prepare(`SELECT "rev" FROM "Person" WHERE "id" = ?`);
      const upsertPerson = conn.prepare(`
        INSERT INTO "Person" ("id","name","isStudent","color","order","vacationDays","heiligabendHalf","silvesterHalf")
        VALUES (@id, @name, @isStudent, @color, @order, @vacationDays, @heiligabendHalf, @silvesterHalf)
        ON CONFLICT("id") DO UPDATE SET "name" = excluded."name", "isStudent" = excluded."isStudent",
          "color" = excluded."color", "order" = excluded."order", "vacationDays" = excluded."vacationDays",
          "heiligabendHalf" = excluded."heiligabendHalf", "silvesterHalf" = excluded."silvesterHalf"`);
      for (const p of body.personen) {
        if (isDead.get("person", p.id)) {
          reject("person", p.id, "Person wurde gelöscht");
          continue;
        }
        const current = personRev.get(p.id) as { rev: number } | undefined;
        if (current && current.rev > p.baseRev) {
          reject("person", p.id, "Konflikt");
          forcePersons.add(p.id);
          continue;
        }
        upsertPerson.run({
          ...p,
          isStudent: p.isStudent ? 1 : 0,
          heiligabendHalf: p.heiligabendHalf ? 1 : 0,
          silvesterHalf: p.silvesterHalf ? 1 : 0,
        });
      }

      const vacationRev = conn.prepare(`SELECT "rev" FROM "Vacation" WHERE "id" = ?`);
      const personExists = conn.prepare(`SELECT 1 FROM "Person" WHERE "id" = ?`);
      const upsertVacation = conn.prepare(`
        INSERT INTO "Vacation" ("id","personId","startDate","endDate","halfDay","note")
        VALUES (@id, @personId, @startDate, @endDate, @halfDay, @note)
        ON CONFLICT("id") DO UPDATE SET "personId" = excluded."personId", "startDate" = excluded."startDate",
          "endDate" = excluded."endDate", "halfDay" = excluded."halfDay", "note" = excluded."note"`);
      for (const v of body.urlaube) {
        if (isDead.get("vacation", v.id)) {
          reject("vacation", v.id, "Urlaub wurde gelöscht");
          continue;
        }
        if (!personExists.get(v.personId)) {
          reject("vacation", v.id, isDead.get("person", v.personId) ? "Person wurde gelöscht" : "Person unbekannt");
          continue;
        }
        const current = vacationRev.get(v.id) as { rev: number } | undefined;
        if (current && current.rev > v.baseRev) {
          reject("vacation", v.id, "Konflikt");
          forceVacations.add(v.id);
          continue;
        }
        upsertVacation.run({ ...v, halfDay: v.halfDay ? 1 : 0 });
      }

      if (body.settings) {
        const current = conn.prepare(`SELECT "rev" FROM "Settings" WHERE "id" = 1`).get() as { rev: number } | undefined;
        if (current && current.rev > body.settings.baseRev) {
          rejected.push({ entity: "settings", id: "1", reason: "Konflikt" });
          forceSettings = true;
        } else {
          conn
            .prepare(
              `INSERT INTO "Settings" ("id","bundesland") VALUES (1, ?) ON CONFLICT("id") DO UPDATE SET "bundesland" = excluded."bundesland"`
            )
            .run(body.settings.bundesland);
        }
      }
    }

    // 3. Alles seit dem Cursor zurückgeben (inkl. der eben übernommenen Änderungen und der Konflikt-Datensätze)
    const personen = (conn.prepare(`SELECT ${PERSON_COLS} FROM "Person" WHERE "rev" > ? ORDER BY "order"`).all(cursor) as PersonRow[]).map(toPerson);
    const urlaube = (conn.prepare(`SELECT ${VACATION_COLS} FROM "Vacation" WHERE "rev" > ?`).all(cursor) as VacationRow[]).map(toVacation);
    const byIdPerson = conn.prepare(`SELECT ${PERSON_COLS} FROM "Person" WHERE "id" = ?`);
    const byIdVacation = conn.prepare(`SELECT ${VACATION_COLS} FROM "Vacation" WHERE "id" = ?`);
    for (const id of forcePersons) {
      const row = byIdPerson.get(id) as PersonRow | undefined;
      if (row && row.rev <= cursor) personen.push(toPerson(row));
    }
    for (const id of forceVacations) {
      const row = byIdVacation.get(id) as VacationRow | undefined;
      if (row && row.rev <= cursor) urlaube.push(toVacation(row));
    }
    const deleted = (conn.prepare(`SELECT "entity", "id" FROM "Tombstone" WHERE "rev" > ?`).all(cursor) as { entity: string; id: string }[])
      .map((t) => ({ entity: (t.entity === "person" ? "person" : "vacation") as SyncEntity, id: t.id }));
    const settingsRow = conn.prepare(`SELECT "bundesland", "rev" FROM "Settings" WHERE "id" = 1`).get() as
      | { bundesland: string; rev: number }
      | undefined;
    const after = conn.prepare(`SELECT "value" FROM "SyncCounter" WHERE "id" = 1`).get() as { value: number };

    return {
      dbId: counter.dbId,
      cursor: after.value,
      reset,
      personen,
      urlaube,
      deleted,
      settings: settingsRow && (settingsRow.rev > cursor || forceSettings) ? settingsRow : null,
      rejected,
    };
  });

  try {
    return run.immediate();
  } catch (err) {
    if (err instanceof Error && "code" in err && (err as { code: string }).code.startsWith("SQLITE_BUSY")) {
      throw new SyncBusyError("Datenbank gerade beschäftigt");
    }
    throw err;
  }
}
