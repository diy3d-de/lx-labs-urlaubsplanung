// Sync-Client gegen eine nachgebildete Server-Antwort (lokale DB per sqflite_common_ffi im Speicher).
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:lx_urlaubsplanung/local_db.dart';
import 'package:lx_urlaubsplanung/models.dart';
import 'package:lx_urlaubsplanung/sync_service.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

const dbId = '0123456789abcdef0123456789abcdef';

Map<String, Object?> personJson(String id, String name, int rev) => {
      'id': id,
      'name': name,
      'isStudent': false,
      'color': 'var(--p0)',
      'order': 0,
      'vacationDays': 30,
      'heiligabendHalf': true,
      'silvesterHalf': true,
      'rev': rev,
    };

void main() {
  sqfliteFfiInit();
  databaseFactory = databaseFactoryFfi;

  late LocalDb db;
  late List<Map<String, dynamic>> anfragen;

  SyncService service(Map<String, Object?> Function(Map<String, dynamic> req) antwort) => SyncService(
        db,
        client: MockClient((req) async {
          final body = jsonDecode(req.body) as Map<String, dynamic>;
          anfragen.add(body);
          expect(req.url.toString(), 'http://nas:3000/api/sync');
          return http.Response(jsonEncode(antwort(body)), 200, headers: {'content-type': 'application/json'});
        }),
      );

  Map<String, Object?> leer({int cursor = 5, bool reset = false}) =>
      {'dbId': dbId, 'cursor': cursor, 'reset': reset, 'personen': [], 'urlaube': [], 'deleted': [], 'settings': null, 'rejected': []};

  setUp(() async {
    db = await LocalDb.open(path: inMemoryDatabasePath);
    await db.db.delete('persons');
    await db.db.delete('vacations');
    await db.db.delete('deletions');
    await db.db.delete('kv');
    await db.setKv(SyncService.kServerUrl, 'http://nas:3000');
    anfragen = [];
  });

  tearDown(() => db.db.close());

  test('Server-Adresse wird normalisiert', () {
    expect(SyncService.parseServerUrl('192.168.1.5:3000').toString(), 'http://192.168.1.5:3000');
    expect(SyncService.parseServerUrl('https://urlaub.example.de/').toString(), 'https://urlaub.example.de');
    expect(SyncService.parseServerUrl('ftp://x'), isNull);
    expect(SyncService.parseServerUrl(''), isNull);
  });

  test('Erster Abgleich sendet lokale Daten mit baseRev 0 und übernimmt den Serverstand', () async {
    await db.savePersonLocal(const Person(id: 'p1', name: 'Anna', color: 'var(--p0)'));
    final s = service((req) => {
          ...leer(cursor: 7),
          'personen': [personJson('p1', 'Anna', 6), personJson('p2', 'Ben', 3)],
        });
    final r = await s.sync();
    expect(anfragen.single['dbId'], isNull);
    expect(anfragen.single['cursor'], 0);
    expect((anfragen.single['personen'] as List).single['baseRev'], 0);
    expect(r.gesendet, 1);
    final persons = await db.persons();
    expect(persons.map((p) => '${p.id}:${p.rev}'), ['p1:6', 'p2:3']);
    expect(await db.pendingChanges(), 0);
    expect(await db.getKv(SyncService.kDbId), dbId);
    expect(await db.getKv(SyncService.kCursor), '7');
  });

  test('Konflikt: Serverstand gewinnt', () async {
    await db.db.insert('persons', {
      'id': 'p1', 'name': 'Anna alt', 'is_student': 0, 'color': 'var(--p0)', 'ord': 0, 'vacation_days': 30,
      'heiligabend_half': 1, 'silvester_half': 1, 'rev': 4, 'dirty': 0, 'local_rev': 0,
    });
    await db.setKv(SyncService.kDbId, dbId);
    await db.setKv(SyncService.kCursor, '4');
    await db.savePersonLocal(const Person(id: 'p1', name: 'Anna mobil', color: 'var(--p0)', rev: 4));
    final s = service((req) => {
          ...leer(cursor: 9),
          'personen': [personJson('p1', 'Anna Web', 8)],
          'rejected': [{'entity': 'person', 'id': 'p1', 'reason': 'Konflikt'}],
        });
    final r = await s.sync();
    expect((anfragen.single['personen'] as List).single['baseRev'], 4);
    expect(r.konflikte, 1);
    expect((await db.persons()).single.name, 'Anna Web');
    expect(await db.pendingChanges(), 0);
  });

  test('Löschungen: lokale werden gesendet, Server-Löschungen übernommen', () async {
    await db.setKv(SyncService.kDbId, dbId);
    await db.db.insert('persons', {
      'id': 'p1', 'name': 'Anna', 'is_student': 0, 'color': 'var(--p0)', 'ord': 0, 'vacation_days': 30,
      'heiligabend_half': 1, 'silvester_half': 1, 'rev': 2, 'dirty': 0, 'local_rev': 0,
    });
    await db.db.insert('vacations', {
      'id': 'v1', 'person_id': 'p1', 'start_date': '2026-08-03', 'end_date': '2026-08-07', 'half_day': 0, 'rev': 3, 'dirty': 0, 'local_rev': 0,
    });
    await db.db.insert('vacations', {
      'id': 'v2', 'person_id': 'p1', 'start_date': '2026-09-01', 'end_date': '2026-09-01', 'half_day': 0, 'rev': 3, 'dirty': 0, 'local_rev': 0,
    });
    await db.deleteVacationLocal((await db.vacations()).firstWhere((v) => v.id == 'v1'));
    final s = service((req) => {
          ...leer(),
          'deleted': [{'entity': 'person', 'id': 'p1'}],
        });
    await s.sync();
    expect(anfragen.single['deleted'], [{'entity': 'vacation', 'id': 'v1'}]);
    expect(await db.persons(), isEmpty);
    expect(await db.vacations(), isEmpty); // v2 per Personen-Löschung mit entfernt
    expect(await db.deletions(), isEmpty);
  });

  test('Nie synchronisierter, lokal gelöschter Eintrag wird nicht gemeldet', () async {
    await db.saveVacationLocal(const Vacation(id: 'v9', personId: 'p1', startDate: '2026-01-02', endDate: '2026-01-02'));
    await db.deleteVacationLocal((await db.vacations()).single);
    expect(await db.deletions(), isEmpty);
    expect(await db.pendingChanges(), 0);
  });

  test('Reset (anderer Server): Serverstand übernehmen, offene lokale Einträge bleiben offen', () async {
    await db.setKv(SyncService.kDbId, 'ffffffffffffffffffffffffffffffff');
    await db.db.insert('persons', {
      'id': 'alt', 'name': 'Alt', 'is_student': 0, 'color': 'var(--p0)', 'ord': 0, 'vacation_days': 30,
      'heiligabend_half': 1, 'silvester_half': 1, 'rev': 5, 'dirty': 0, 'local_rev': 0,
    });
    await db.savePersonLocal(const Person(id: 'neu', name: 'Neu', color: 'var(--p1)', rev: 5));
    final s = service((req) => {...leer(cursor: 3, reset: true), 'personen': [personJson('srv', 'Server', 2)]});
    final r = await s.sync();
    expect(r.reset, isTrue);
    final persons = await db.persons();
    expect(persons.map((p) => p.id).toSet(), {'neu', 'srv'});
    expect(persons.firstWhere((p) => p.id == 'neu').rev, 0);
    expect(await db.pendingChanges(), 1);
    expect(await db.getKv(SyncService.kDbId), dbId);
  });

  test('Bundesland: lokale Änderung wird mit baseRev gesendet', () async {
    await db.setKv(SyncService.kDbId, dbId);
    await db.setKv(SyncService.kBundesland, 'BY');
    await db.setKv(SyncService.kBundeslandDirty, '1');
    await db.setKv(SyncService.kBundeslandRev, '4');
    final s = service((req) => {...leer(), 'settings': {'bundesland': 'BY', 'rev': 10}});
    await s.sync();
    expect(anfragen.single['settings'], {'bundesland': 'BY', 'baseRev': 4});
    expect(await db.getKv(SyncService.kBundeslandDirty), isNull);
    expect(await db.getKv(SyncService.kBundeslandRev), '10');
  });

  test('Serverfehler wird verständlich gemeldet', () async {
    final s = SyncService(db, client: MockClient((_) async => http.Response('{"error":"Datenbank gerade beschäftigt"}', 503,
        headers: {'content-type': 'application/json; charset=utf-8'})));
    await expectLater(s.sync(), throwsA(isA<SyncException>().having((e) => e.message, 'message', contains('beschäftigt'))));
  });
}
