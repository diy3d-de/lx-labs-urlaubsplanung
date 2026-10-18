// Abgleich mit dem Server (POST /api/sync, Protokoll siehe src/lib/sync.ts im Server-Projekt).
//
// Ablauf: offene Änderungen (dirty) und Löschungen senden, danach alles übernehmen, was der Server seit dem
// letzten Cursor geändert hat. Bei Konflikten gewinnt der Server; Löschungen gewinnen immer.
import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:sqflite/sqflite.dart';

import 'local_db.dart';
import 'models.dart';

class SyncException implements Exception {
  final String message;
  SyncException(this.message);
  @override
  String toString() => message;
}

class SyncResult {
  final int empfangen;
  final int gesendet;
  final int konflikte;
  final bool reset;
  SyncResult({required this.empfangen, required this.gesendet, required this.konflikte, required this.reset});
}

class SyncService {
  final LocalDb local;
  final http.Client client;
  SyncService(this.local, {http.Client? client}) : client = client ?? http.Client();

  static const kServerUrl = 'server_url';
  static const kDbId = 'sync_db_id';
  static const kCursor = 'sync_cursor';
  static const kBundesland = 'bundesland';
  static const kBundeslandRev = 'bundesland_rev';
  static const kBundeslandDirty = 'bundesland_dirty';
  static const kLetzterSync = 'letzter_sync';

  /// Normalisiert eine eingegebene Server-Adresse ("192.168.1.5:3000" → "http://192.168.1.5:3000").
  static Uri? parseServerUrl(String input) {
    var s = input.trim();
    if (s.isEmpty) return null;
    if (!s.contains('://')) s = 'http://$s';
    final uri = Uri.tryParse(s);
    if (uri == null || (uri.scheme != 'http' && uri.scheme != 'https') || uri.host.isEmpty) return null;
    return uri.replace(path: uri.path.replaceAll(RegExp(r'/+$'), ''), query: null, fragment: null);
  }

  Future<Uri?> serverUrl() async {
    final s = await local.getKv(kServerUrl);
    return s == null ? null : parseServerUrl(s);
  }

  /// Wurde mit dem eingestellten Server schon einmal synchronisiert?
  Future<bool> hatSchonSynchronisiert() async => (await local.getKv(kDbId)) != null;

  /// Server wechseln/entfernen: Abgleichsstand vergessen (lokale Daten bleiben).
  Future<void> setServer(String? url) async {
    await local.setKv(kServerUrl, url);
    await local.setKv(kDbId, null);
    await local.setKv(kCursor, null);
  }

  /// Vor dem ersten Abgleich: lokale Daten verwerfen und nur den Serverstand übernehmen.
  Future<void> lokaleDatenVerwerfen() => local.db.transaction((tx) async {
        await tx.delete('vacations');
        await tx.delete('persons');
        await tx.delete('deletions');
        await tx.delete('kv', where: 'key IN (?, ?)', whereArgs: [kBundeslandDirty, kBundeslandRev]);
      });

  Future<SyncResult> sync() async {
    final base = await serverUrl();
    if (base == null) throw SyncException('Kein Server eingestellt');

    final dbId = await local.getKv(kDbId);
    final cursor = int.tryParse(await local.getKv(kCursor) ?? '') ?? 0;
    final persons = await local.dirtyPersons();
    final vacations = await local.dirtyVacations();
    final deletions = await local.deletions();
    final landDirty = await local.getKv(kBundeslandDirty) == '1';
    final land = await local.getKv(kBundesland);
    final landRev = int.tryParse(await local.getKv(kBundeslandRev) ?? '') ?? 0;

    final body = {
      'dbId': dbId,
      'cursor': dbId == null ? 0 : cursor,
      'personen': [for (final d in persons) d.person.toSyncJson()],
      'urlaube': [for (final d in vacations) d.vacation.toSyncJson()],
      'deleted': [for (final d in deletions) {'entity': d.entity, 'id': d.id}],
      if (landDirty && land != null) 'settings': {'bundesland': land, 'baseRev': landRev},
    };

    final http.Response res;
    try {
      res = await client
          .post(base.replace(path: '${base.path}/api/sync'),
              headers: {'Content-Type': 'application/json'}, body: jsonEncode(body))
          .timeout(const Duration(seconds: 30));
    } catch (e) {
      throw SyncException('Server nicht erreichbar');
    }
    if (res.statusCode != 200) {
      String meldung = 'HTTP ${res.statusCode}';
      try {
        meldung = (jsonDecode(utf8.decode(res.bodyBytes)) as Map)['error'] as String? ?? meldung;
      } catch (_) {}
      throw SyncException('Abgleich fehlgeschlagen: $meldung');
    }
    final Map<String, dynamic> antwort;
    try {
      antwort = jsonDecode(utf8.decode(res.bodyBytes)) as Map<String, dynamic>;
    } catch (_) {
      throw SyncException('Unerwartete Antwort vom Server');
    }

    return _apply(
      antwort,
      sentPersons: {for (final d in persons) d.person.id: d.localRev},
      sentVacations: {for (final d in vacations) d.vacation.id: d.localRev},
      sentDeletions: deletions,
      sentLand: landDirty ? land : null,
    );
  }

  Future<SyncResult> _apply(
    Map<String, dynamic> a, {
    required Map<String, int> sentPersons,
    required Map<String, int> sentVacations,
    required List<({String entity, String id})> sentDeletions,
    required String? sentLand,
  }) async {
    final reset = a['reset'] == true;
    final personen = [for (final j in a['personen'] as List) Person.fromSyncJson(j as Map<String, dynamic>)];
    final urlaube = [for (final j in a['urlaube'] as List) Vacation.fromSyncJson(j as Map<String, dynamic>)];
    final deleted = [for (final d in a['deleted'] as List) (entity: d['entity'] as String, id: d['id'] as String)];
    final rejected = [for (final r in a['rejected'] as List) (entity: r['entity'] as String, id: r['id'] as String, reason: r['reason'] as String)];
    final settings = a['settings'] as Map<String, dynamic>?;
    var konflikte = 0;

    await local.db.transaction((tx) async {
      // Wurde ein Datensatz während des Abgleichs lokal erneut geändert, bleibt er offen (dirty)
      Future<bool> unveraendert(String table, String id, int? sentLocalRev) async {
        if (sentLocalRev == null) {
          final r = await tx.query(table, columns: ['dirty'], where: 'id = ?', whereArgs: [id]);
          return r.isEmpty || r.first['dirty'] == 0;
        }
        final r = await tx.query(table, columns: ['local_rev'], where: 'id = ?', whereArgs: [id]);
        return r.isEmpty || r.first['local_rev'] == sentLocalRev;
      }

      if (reset) {
        // Anderer oder neu aufgesetzter Server: dessen Stand übernehmen; lokale offene Änderungen bleiben
        // als neue Einträge (baseRev 0) offen und werden beim nächsten Abgleich gesendet.
        await tx.delete('persons', where: 'dirty = 0');
        await tx.delete('vacations', where: 'dirty = 0');
        await tx.delete('deletions');
        await tx.rawUpdate('UPDATE persons SET rev = 0');
        await tx.rawUpdate('UPDATE vacations SET rev = 0');
      }

      for (final r in rejected) {
        if (r.reason == 'Konflikt') {
          konflikte++;
          continue; // Serverstand kommt unten mit
        }
        if (r.reason == 'Person unbekannt') continue; // beim nächsten Abgleich erneut
        if (r.entity == 'person') {
          await tx.delete('vacations', where: 'person_id = ?', whereArgs: [r.id]);
          await tx.delete('persons', where: 'id = ?', whereArgs: [r.id]);
        } else if (r.entity == 'vacation') {
          await tx.delete('vacations', where: 'id = ?', whereArgs: [r.id]);
        }
      }

      for (final p in personen) {
        final konflikt = rejected.any((r) => r.entity == 'person' && r.id == p.id && r.reason == 'Konflikt');
        if (!konflikt && !await unveraendert('persons', p.id, sentPersons[p.id])) {
          await tx.update('persons', {'rev': p.rev}, where: 'id = ?', whereArgs: [p.id]);
          continue;
        }
        await tx.insert(
          'persons',
          {
            'id': p.id,
            'name': p.name,
            'is_student': p.isStudent ? 1 : 0,
            'color': p.color,
            'ord': p.order,
            'vacation_days': p.vacationDays,
            'heiligabend_half': p.heiligabendHalf ? 1 : 0,
            'silvester_half': p.silvesterHalf ? 1 : 0,
            'rev': p.rev,
            'dirty': 0,
            'local_rev': 0,
          },
          conflictAlgorithm: ConflictAlgorithm.replace,
        );
      }

      for (final v in urlaube) {
        final konflikt = rejected.any((r) => r.entity == 'vacation' && r.id == v.id && r.reason == 'Konflikt');
        if (!konflikt && !await unveraendert('vacations', v.id, sentVacations[v.id])) {
          await tx.update('vacations', {'rev': v.rev}, where: 'id = ?', whereArgs: [v.id]);
          continue;
        }
        await tx.insert(
          'vacations',
          {
            'id': v.id,
            'person_id': v.personId,
            'start_date': v.startDate,
            'end_date': v.endDate,
            'half_day': v.halfDay ? 1 : 0,
            'note': v.note,
            'rev': v.rev,
            'dirty': 0,
            'local_rev': 0,
          },
          conflictAlgorithm: ConflictAlgorithm.replace,
        );
      }

      for (final d in deleted) {
        if (d.entity == 'person') {
          await tx.delete('vacations', where: 'person_id = ?', whereArgs: [d.id]);
          await tx.delete('persons', where: 'id = ?', whereArgs: [d.id]);
        } else {
          await tx.delete('vacations', where: 'id = ?', whereArgs: [d.id]);
        }
      }

      for (final d in sentDeletions) {
        await tx.delete('deletions', where: 'entity = ? AND id = ?', whereArgs: [d.entity, d.id]);
      }

      Future<void> kv(String key, String? value) => value == null
          ? tx.delete('kv', where: 'key = ?', whereArgs: [key])
          : tx.insert('kv', {'key': key, 'value': value}, conflictAlgorithm: ConflictAlgorithm.replace);

      if (settings != null) {
        final aktuell = (await tx.query('kv', where: 'key = ?', whereArgs: [kBundesland])).firstOrNull?['value'];
        final lokalGeaendert = (await tx.query('kv', where: 'key = ?', whereArgs: [kBundeslandDirty])).isNotEmpty;
        // Eigene, während des Abgleichs erneut geänderte Auswahl nicht überschreiben
        if (!lokalGeaendert || sentLand == aktuell || reset) {
          await kv(kBundesland, settings['bundesland'] as String);
          await kv(kBundeslandDirty, null);
        }
        await kv(kBundeslandRev, '${settings['rev']}');
      } else if (sentLand != null) {
        await kv(kBundeslandDirty, null);
      }
      await kv(kDbId, a['dbId'] as String);
      await kv(kCursor, '${a['cursor']}');
      await kv(kLetzterSync, DateTime.now().toIso8601String());
    });

    return SyncResult(
      empfangen: personen.length + urlaube.length + deleted.length,
      gesendet: sentPersons.length + sentVacations.length + sentDeletions.length,
      konflikte: konflikte,
      reset: reset,
    );
  }
}
