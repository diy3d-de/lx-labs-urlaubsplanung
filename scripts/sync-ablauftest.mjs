// Ablauftest für POST /api/sync gegen einen laufenden Server mit FRISCHER Datenbank:
//   DATABASE_URL=file:./synctest.db npx prisma migrate deploy
//   SQLITE_PATH=prisma/synctest.db npx next dev -p 3456
//   node scripts/sync-ablauftest.mjs http://127.0.0.1:3456
import assert from "node:assert/strict";
import http from "node:http";
const BASE = process.argv[2] ?? "http://127.0.0.1:3456";

async function call(path, method = "GET", body) {
  const res = await fetch(BASE + path, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, data: text ? JSON.parse(text) : null };
}
const sync = (b) => call("/api/sync", "POST", { personen: [], urlaube: [], deleted: [], ...b });

// 1. Erster Kontakt
let r = await sync({ dbId: null, cursor: 0 });
assert.equal(r.status, 200, JSON.stringify(r.data));
assert.match(r.data.dbId, /^[0-9a-f]{32}$/);
assert.equal(r.data.reset, false);
const dbId = r.data.dbId;

// 2. Web legt Person + Urlaub an
const p = (await call("/api/personen", "POST", { name: "Anna", vacationDays: 28 })).data;
const v = (await call("/api/urlaube", "POST", { personId: p.id, startDate: "2026-08-03", endDate: "2026-08-14" })).data;
r = await sync({ dbId, cursor: 0 });
assert.equal(r.data.personen.length, 1);
assert.equal(r.data.urlaube.length, 1);
const annaRev = r.data.personen[0].rev;
const c1 = r.data.cursor;
r = await sync({ dbId, cursor: c1 });
assert.equal(r.data.personen.length + r.data.urlaube.length + r.data.deleted.length, 0);
assert.equal(r.data.settings, null);

// 3. Mobil pusht neue Person + Urlaub (eigene UUIDs) und Bundesland
const mp = { id: "11111111-1111-4111-8111-111111111111", name: "Ben", isStudent: true, color: "var(--p3)", order: 1, vacationDays: 0, heiligabendHalf: true, silvesterHalf: true, baseRev: 0 };
const mv = { id: "22222222-2222-4222-8222-222222222222", personId: mp.id, startDate: "2026-12-24", endDate: "2026-12-24", halfDay: true, note: "Heiligabend", baseRev: 0 };
r = await sync({ dbId, cursor: c1, personen: [mp], urlaube: [mv], settings: { bundesland: "BY", baseRev: 0 } });
assert.equal(r.status, 200, JSON.stringify(r.data));
assert.deepEqual(r.data.rejected, []);
assert.deepEqual(r.data.personen.map((x) => x.id), [mp.id]);
assert.equal(r.data.urlaube[0].note, "Heiligabend");
assert.equal(r.data.urlaube[0].halfDay, true);
assert.equal(r.data.settings.bundesland, "BY");
const c2 = r.data.cursor;
// Web (Prisma) liest die per Sync angelegten Datensätze
const webPersonen = (await call("/api/personen")).data;
assert.equal(webPersonen.length, 2, JSON.stringify(webPersonen));
assert.equal((await call("/api/urlaube")).data.length, 2);
assert.equal((await call("/api/settings")).data.bundesland, "BY");

// 4. Konflikt: Web ändert Anna, Mobil schickt veraltete Änderung
await call(`/api/personen/${p.id}`, "PATCH", { name: "Anna Web" });
r = await sync({ dbId, cursor: c2, personen: [{ ...mp, id: p.id, name: "Anna Mobil", isStudent: false, vacationDays: 28, order: 0, baseRev: annaRev }] });
assert.deepEqual(r.data.rejected, [{ entity: "person", id: p.id, reason: "Konflikt" }]);
assert.equal(r.data.personen.find((x) => x.id === p.id).name, "Anna Web");
assert.equal((await call("/api/personen")).data.find((x) => x.id === p.id).name, "Anna Web");
// Mit aktueller baseRev klappt es
const aktuell = r.data.personen.find((x) => x.id === p.id).rev;
r = await sync({ dbId, cursor: r.data.cursor, personen: [{ ...mp, id: p.id, name: "Anna Mobil", isStudent: false, vacationDays: 28, order: 0, baseRev: aktuell }] });
assert.deepEqual(r.data.rejected, []);
assert.equal(r.data.personen[0].name, "Anna Mobil");
const c3 = r.data.cursor;

// 5. Web löscht Anna -> Tombstones (Person + Urlaub per Cascade)
await fetch(`${BASE}/api/personen/${p.id}`, { method: "DELETE" });
r = await sync({ dbId, cursor: c3 });
assert.deepEqual(r.data.deleted.map((d) => `${d.entity}:${d.id}`).sort(), [`person:${p.id}`, `vacation:${v.id}`].sort());
const c4 = r.data.cursor;

// 6. Gelöschte IDs werden nicht wiederbelebt; unbekannte Person
r = await sync({
  dbId,
  cursor: c4,
  personen: [{ ...mp, id: p.id, baseRev: 999 }],
  urlaube: [
    { ...mv, id: "33333333-3333-4333-8333-333333333333", personId: p.id },
    { ...mv, id: "44444444-4444-4444-8444-444444444444", personId: "gibtsnicht" },
  ],
});
assert.deepEqual(r.data.rejected.map((x) => x.reason), ["Person wurde gelöscht", "Person wurde gelöscht", "Person unbekannt"]);
assert.equal((await call("/api/personen")).data.length, 1);

// 7. Mobil löscht Urlaub
r = await sync({ dbId, cursor: r.data.cursor, deleted: [{ entity: "vacation", id: mv.id }] });
assert.deepEqual(r.data.deleted, [{ entity: "vacation", id: mv.id }]);
const c5 = r.data.cursor;

// 8. Andere Datenbank oder Cursor über dem Zähler -> reset, nichts übernommen
r = await sync({ dbId: "0".repeat(32), cursor: c5, personen: [{ ...mp, id: "55555555-5555-4555-8555-555555555555", baseRev: 0 }] });
assert.equal(r.data.reset, true);
assert.equal(r.data.personen.length, 1);
assert.equal((await call("/api/personen")).data.length, 1);
r = await sync({ dbId, cursor: c5 + 1000 });
assert.equal(r.data.reset, true);
r = await sync({ dbId: null, cursor: 5 });
assert.equal(r.data.reset, true);

// 9. Ungültige Daten -> 400/415
assert.equal((await sync({ dbId, cursor: 0, urlaube: [{ ...mv, startDate: "2026-02-30" }] })).status, 400);
assert.equal((await sync({ dbId, cursor: 0, personen: [{ ...mp, id: "../etc" }] })).status, 400);
assert.equal((await sync({ dbId, cursor: 0, personen: [{ ...mp, baseRev: -1 }] })).status, 400);
assert.equal((await sync({ dbId: "kaputt", cursor: 0 })).status, 400);
const ohneTyp = await fetch(BASE + "/api/sync", { method: "POST", body: "{}" });
assert.equal(ohneTyp.status, 415);

// 10. Settings-GET erhöht rev nicht
const before = (await sync({ dbId, cursor: 0 })).data.cursor;
await call("/api/settings");
assert.equal((await sync({ dbId, cursor: 0 })).data.cursor, before);

// 11. DNS-Rebinding: fremder Host-Header wird abgelehnt
const status = await new Promise((resolve, reject) => {
  const u = new URL(BASE + "/api/personen");
  http.get({ host: u.hostname, port: u.port, path: u.pathname, headers: { Host: "evil.example.com" } }, (res) => {
    res.resume();
    resolve(res.statusCode);
  }).on("error", reject);
});
assert.equal(status, 421);

console.log("ALLE SYNC-TESTS OK");
