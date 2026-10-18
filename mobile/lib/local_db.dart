// Lokale SQLite-Datenbank: Personen, Urlaube, offene Löschungen, Einstellungen und Feiertags-Cache.
// dirty = lokal geändert und noch nicht synchronisiert; local_rev zählt lokale Änderungen, damit ein Abgleich
// eine während des Abgleichs gemachte Änderung nicht versehentlich als erledigt markiert.
import 'package:path/path.dart' as p;
import 'package:sqflite/sqflite.dart';

import 'models.dart';

class DirtyPerson {
  final Person person;
  final int localRev;
  DirtyPerson(this.person, this.localRev);
}

class DirtyVacation {
  final Vacation vacation;
  final int localRev;
  DirtyVacation(this.vacation, this.localRev);
}

class LocalDb {
  final Database db;
  LocalDb._(this.db);

  static Future<LocalDb> open({String? path}) async {
    final file = path ?? p.join(await getDatabasesPath(), 'urlaubsplanung.db');
    final db = await openDatabase(
      file,
      version: 1,
      onConfigure: (db) => db.execute('PRAGMA foreign_keys = OFF'),
      onCreate: (db, _) async {
        await db.execute('''CREATE TABLE persons (
          id TEXT PRIMARY KEY, name TEXT NOT NULL, is_student INTEGER NOT NULL, color TEXT NOT NULL,
          ord INTEGER NOT NULL, vacation_days REAL NOT NULL, heiligabend_half INTEGER NOT NULL,
          silvester_half INTEGER NOT NULL, rev INTEGER NOT NULL DEFAULT 0, dirty INTEGER NOT NULL DEFAULT 0,
          local_rev INTEGER NOT NULL DEFAULT 0)''');
        await db.execute('''CREATE TABLE vacations (
          id TEXT PRIMARY KEY, person_id TEXT NOT NULL, start_date TEXT NOT NULL, end_date TEXT NOT NULL,
          half_day INTEGER NOT NULL, note TEXT, rev INTEGER NOT NULL DEFAULT 0, dirty INTEGER NOT NULL DEFAULT 0,
          local_rev INTEGER NOT NULL DEFAULT 0)''');
        await db.execute('CREATE INDEX vacations_person ON vacations(person_id)');
        await db.execute('CREATE TABLE deletions (entity TEXT NOT NULL, id TEXT NOT NULL, PRIMARY KEY (entity, id))');
        await db.execute('CREATE TABLE kv (key TEXT PRIMARY KEY, value TEXT)');
        await db.execute('CREATE TABLE holiday_cache (key TEXT PRIMARY KEY, json TEXT NOT NULL, fetched_at INTEGER NOT NULL)');
      },
    );
    return LocalDb._(db);
  }

  // ---------------------------------------------------------------- Lesen

  static Person _person(Map<String, Object?> r) => Person(
        id: r['id'] as String,
        name: r['name'] as String,
        isStudent: r['is_student'] == 1,
        color: r['color'] as String,
        order: r['ord'] as int,
        vacationDays: (r['vacation_days'] as num).toDouble(),
        heiligabendHalf: r['heiligabend_half'] == 1,
        silvesterHalf: r['silvester_half'] == 1,
        rev: r['rev'] as int,
      );

  static Vacation _vacation(Map<String, Object?> r) => Vacation(
        id: r['id'] as String,
        personId: r['person_id'] as String,
        startDate: r['start_date'] as String,
        endDate: r['end_date'] as String,
        halfDay: r['half_day'] == 1,
        note: r['note'] as String?,
        rev: r['rev'] as int,
      );

  Future<List<Person>> persons() async =>
      (await db.query('persons', orderBy: 'ord, name')).map(_person).toList();

  Future<List<Vacation>> vacations() async =>
      (await db.query('vacations', orderBy: 'start_date')).map(_vacation).toList();

  Future<List<DirtyPerson>> dirtyPersons() async => (await db.query('persons', where: 'dirty = 1'))
      .map((r) => DirtyPerson(_person(r), r['local_rev'] as int))
      .toList();

  Future<List<DirtyVacation>> dirtyVacations() async => (await db.query('vacations', where: 'dirty = 1'))
      .map((r) => DirtyVacation(_vacation(r), r['local_rev'] as int))
      .toList();

  Future<List<({String entity, String id})>> deletions() async =>
      (await db.query('deletions')).map((r) => (entity: r['entity'] as String, id: r['id'] as String)).toList();

  Future<bool> hasLocalData() async =>
      (Sqflite.firstIntValue(await db.rawQuery('SELECT (SELECT count(*) FROM persons) + (SELECT count(*) FROM vacations)')) ?? 0) > 0;

  Future<int> pendingChanges() async =>
      Sqflite.firstIntValue(await db.rawQuery(
          'SELECT (SELECT count(*) FROM persons WHERE dirty = 1) + (SELECT count(*) FROM vacations WHERE dirty = 1) + (SELECT count(*) FROM deletions)')) ??
      0;

  // ---------------------------------------------------------------- Lokale Änderungen (markieren dirty)

  Map<String, Object?> _personRow(Person x) => {
        'id': x.id,
        'name': x.name,
        'is_student': x.isStudent ? 1 : 0,
        'color': x.color,
        'ord': x.order,
        'vacation_days': x.vacationDays,
        'heiligabend_half': x.heiligabendHalf ? 1 : 0,
        'silvester_half': x.silvesterHalf ? 1 : 0,
        'rev': x.rev,
      };

  Map<String, Object?> _vacationRow(Vacation x) => {
        'id': x.id,
        'person_id': x.personId,
        'start_date': x.startDate,
        'end_date': x.endDate,
        'half_day': x.halfDay ? 1 : 0,
        'note': x.note,
        'rev': x.rev,
      };

  Future<void> savePersonLocal(Person x) => db.transaction((tx) async {
        final n = await tx.rawUpdate(
          'UPDATE persons SET name=?, is_student=?, color=?, ord=?, vacation_days=?, heiligabend_half=?, silvester_half=?, dirty=1, local_rev=local_rev+1 WHERE id=?',
          [x.name, x.isStudent ? 1 : 0, x.color, x.order, x.vacationDays, x.heiligabendHalf ? 1 : 0, x.silvesterHalf ? 1 : 0, x.id],
        );
        if (n == 0) await tx.insert('persons', {..._personRow(x), 'dirty': 1, 'local_rev': 1});
      });

  Future<void> saveVacationLocal(Vacation x) => db.transaction((tx) async {
        final n = await tx.rawUpdate(
          'UPDATE vacations SET person_id=?, start_date=?, end_date=?, half_day=?, note=?, dirty=1, local_rev=local_rev+1 WHERE id=?',
          [x.personId, x.startDate, x.endDate, x.halfDay ? 1 : 0, x.note, x.id],
        );
        if (n == 0) await tx.insert('vacations', {..._vacationRow(x), 'dirty': 1, 'local_rev': 1});
      });

  /// Löscht lokal; war der Datensatz schon auf dem Server (rev > 0), wird die Löschung zum Abgleich vorgemerkt.
  Future<void> deleteVacationLocal(Vacation x) => db.transaction((tx) async {
        await tx.delete('vacations', where: 'id = ?', whereArgs: [x.id]);
        if (x.rev > 0) await tx.insert('deletions', {'entity': 'vacation', 'id': x.id}, conflictAlgorithm: ConflictAlgorithm.ignore);
      });

  Future<void> deletePersonLocal(Person x) => db.transaction((tx) async {
        // Urlaube der Person löscht der Server per Cascade mit; lokal ebenso entfernen
        await tx.delete('vacations', where: 'person_id = ?', whereArgs: [x.id]);
        await tx.delete('persons', where: 'id = ?', whereArgs: [x.id]);
        if (x.rev > 0) await tx.insert('deletions', {'entity': 'person', 'id': x.id}, conflictAlgorithm: ConflictAlgorithm.ignore);
      });

  // ---------------------------------------------------------------- Einstellungen

  Future<String?> getKv(String key) async {
    final r = await db.query('kv', where: 'key = ?', whereArgs: [key]);
    return r.isEmpty ? null : r.first['value'] as String?;
  }

  Future<void> setKv(String key, String? value) async {
    if (value == null) {
      await db.delete('kv', where: 'key = ?', whereArgs: [key]);
    } else {
      await db.insert('kv', {'key': key, 'value': value}, conflictAlgorithm: ConflictAlgorithm.replace);
    }
  }

  // ---------------------------------------------------------------- Feiertags-Cache

  Future<({String json, int fetchedAt})?> cachedHolidays(String key) async {
    final r = await db.query('holiday_cache', where: 'key = ?', whereArgs: [key]);
    return r.isEmpty ? null : (json: r.first['json'] as String, fetchedAt: r.first['fetched_at'] as int);
  }

  Future<void> cacheHolidays(String key, String json) => db.insert(
        'holiday_cache',
        {'key': key, 'json': json, 'fetched_at': DateTime.now().millisecondsSinceEpoch},
        conflictAlgorithm: ConflictAlgorithm.replace,
      );
}
