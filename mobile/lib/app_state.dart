// Zentraler App-Zustand: lokale Daten, Feiertage, Abgleich (automatisch nach Änderungen und beim Start).
import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:uuid/uuid.dart';

import 'constants.dart';
import 'holidays.dart';
import 'local_db.dart';
import 'models.dart';
import 'sync_service.dart';

enum SyncStatus { aus, bereit, laeuft, fehler }

class AppState extends ChangeNotifier {
  final LocalDb db;
  final HolidayService holidays;
  final SyncService syncService;
  AppState(this.db, {HolidayService? holidays, SyncService? sync})
      : holidays = holidays ?? HolidayService(db),
        syncService = sync ?? SyncService(db);

  static const _uuid = Uuid();

  List<Person> persons = [];
  List<Vacation> vacations = [];
  String bundesland = 'BW';
  String? serverUrl;
  SyncStatus syncStatus = SyncStatus.aus;
  String? syncMeldung;
  DateTime? letzterSync;
  int offeneAenderungen = 0;
  final Map<int, HolidayData> _holidayCache = {};
  Timer? _syncTimer;
  bool _syncLaeuft = false;

  Future<void> init() async {
    bundesland = await db.getKv(SyncService.kBundesland) ?? 'BW';
    serverUrl = await db.getKv(SyncService.kServerUrl);
    final ls = await db.getKv(SyncService.kLetzterSync);
    letzterSync = ls == null ? null : DateTime.tryParse(ls);
    await reload();
    syncStatus = serverUrl == null ? SyncStatus.aus : SyncStatus.bereit;
  }

  Future<void> reload() async {
    persons = await db.persons();
    vacations = await db.vacations();
    bundesland = await db.getKv(SyncService.kBundesland) ?? bundesland;
    offeneAenderungen = await db.pendingChanges();
    notifyListeners();
  }

  Person? personById(String id) => persons.where((p) => p.id == id).firstOrNull;

  // ---------------------------------------------------------------- Feiertage

  HolidayData holidaysFor(int year) {
    final cached = _holidayCache[year];
    if (cached != null) return cached;
    _holidayCache[year] = HolidayData.empty;
    holidays.load(year, bundesland).then((data) {
      _holidayCache[year] = data;
      notifyListeners();
    });
    return HolidayData.empty;
  }

  Future<void> refreshHolidays() async {
    _holidayCache.clear();
    notifyListeners();
  }

  // ---------------------------------------------------------------- Änderungen

  Future<void> savePerson(Person p) async {
    await db.savePersonLocal(p);
    await _afterChange();
  }

  Person newPerson({required String name}) {
    final order = persons.isEmpty ? 0 : persons.map((p) => p.order).reduce((a, b) => a > b ? a : b) + 1;
    return Person(id: _uuid.v4(), name: name, color: paletteVar(persons.length), order: order);
  }

  Vacation newVacation({required String personId, required String start, required String end}) =>
      Vacation(id: _uuid.v4(), personId: personId, startDate: start, endDate: end);

  Future<void> deletePerson(Person p) async {
    await db.deletePersonLocal(p);
    await _afterChange();
  }

  Future<void> saveVacation(Vacation v) async {
    await db.saveVacationLocal(v);
    await _afterChange();
  }

  Future<void> deleteVacation(Vacation v) async {
    await db.deleteVacationLocal(v);
    await _afterChange();
  }

  Future<void> setBundesland(String code) async {
    if (code == bundesland) return;
    await db.setKv(SyncService.kBundesland, code);
    await db.setKv(SyncService.kBundeslandDirty, '1');
    bundesland = code;
    _holidayCache.clear();
    await _afterChange();
  }

  Future<void> _afterChange() async {
    await reload();
    _planeSync();
  }

  // ---------------------------------------------------------------- Abgleich

  /// Abgleich kurz nach der letzten Änderung (mehrere Änderungen zusammenfassen).
  void _planeSync() {
    if (serverUrl == null) return;
    _syncTimer?.cancel();
    _syncTimer = Timer(const Duration(seconds: 2), () => synchronisieren(still: true));
  }

  /// Speichert die Server-Adresse (null = ohne Server). Der erste Abgleich passiert erst nach [ersterAbgleich].
  Future<void> setServer(String? url) async {
    await syncService.setServer(url);
    serverUrl = url;
    syncStatus = url == null ? SyncStatus.aus : SyncStatus.bereit;
    syncMeldung = null;
    notifyListeners();
  }

  Future<bool> brauchtErstabgleichEntscheidung() async =>
      !await syncService.hatSchonSynchronisiert() && await db.hasLocalData();

  Future<void> ersterAbgleich({required bool lokaleVerwerfen}) async {
    if (lokaleVerwerfen) await syncService.lokaleDatenVerwerfen();
    await reload();
    await synchronisieren(erstabgleichBestaetigt: true);
  }

  /// Führt einen Abgleich aus; [still] = ohne Fehlermeldung an die Oberfläche (nur Status).
  Future<SyncResult?> synchronisieren({bool still = false, bool erstabgleichBestaetigt = false}) async {
    if (serverUrl == null || _syncLaeuft) return null;
    // Vor dem allerersten Abgleich mit lokalen Daten muss der Nutzer entscheiden (Einstellungen)
    if (!erstabgleichBestaetigt && await brauchtErstabgleichEntscheidung()) {
      if (still) return null;
      throw SyncException('Erster Abgleich: Bitte in den Einstellungen wählen, was mit den lokalen Daten passiert.');
    }
    _syncLaeuft = true;
    syncStatus = SyncStatus.laeuft;
    notifyListeners();
    try {
      var result = await syncService.sync();
      // Nach einem Reset (anderer Server) offene lokale Einträge gleich nachschieben
      if (result.reset && await db.pendingChanges() > 0) result = await syncService.sync();
      letzterSync = DateTime.now();
      syncStatus = SyncStatus.bereit;
      syncMeldung = result.konflikte > 0
          ? '${result.konflikte} Änderung(en) wurden vom Server überschrieben, weil der Eintrag dort neuer war.'
          : null;
      _holidayCache.clear();
      await reload();
      return result;
    } on SyncException catch (e) {
      syncStatus = SyncStatus.fehler;
      syncMeldung = e.message;
      notifyListeners();
      if (!still) rethrow;
      return null;
    } finally {
      _syncLaeuft = false;
    }
  }

  @override
  void dispose() {
    _syncTimer?.cancel();
    super.dispose();
  }
}

/// Stellt den AppState im Widget-Baum bereit.
class AppScope extends InheritedNotifier<AppState> {
  const AppScope({super.key, required AppState state, required super.child}) : super(notifier: state);

  static AppState of(BuildContext context) => context.dependOnInheritedWidgetOfExactType<AppScope>()!.notifier!;
}
