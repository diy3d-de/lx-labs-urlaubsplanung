// Gesetzliche Feiertage (Nager.Date) und Schulferien (OpenHolidays API) wie in der Web-App (src/lib/holidays.ts),
// direkt abgerufen und lokal zwischengespeichert, damit die App auch offline vollständig funktioniert.
import 'dart:convert';

import 'package:http/http.dart' as http;

import 'local_db.dart';
import 'models.dart';

class HolidayData {
  final List<PublicHoliday> feiertage;
  final List<SchoolHoliday> ferien;
  const HolidayData(this.feiertage, this.ferien);
  static const empty = HolidayData([], []);
}

class HolidayService {
  final LocalDb db;
  final http.Client client;
  HolidayService(this.db, {http.Client? client}) : client = client ?? http.Client();

  static const _maxAlter = Duration(days: 7);

  Future<HolidayData> load(int year, String land, {bool forceRefresh = false}) async {
    final key = '$year-$land';
    final cached = await db.cachedHolidays(key);
    final frisch = cached != null &&
        DateTime.now().difference(DateTime.fromMillisecondsSinceEpoch(cached.fetchedAt)) < _maxAlter;
    if (cached != null && frisch && !forceRefresh) return _decode(cached.json);
    try {
      final data = await _fetch(year, land);
      await db.cacheHolidays(key, jsonEncode({
        'feiertage': [for (final h in data.feiertage) {'date': h.date, 'name': h.name}],
        'ferien': [for (final f in data.ferien) {'name': f.name, 'start': f.start, 'end': f.end}],
      }));
      return data;
    } catch (_) {
      // Offline: alter Stand ist besser als nichts
      return cached != null ? _decode(cached.json) : HolidayData.empty;
    }
  }

  HolidayData _decode(String json) {
    final j = jsonDecode(json) as Map<String, dynamic>;
    return HolidayData(
      [for (final h in j['feiertage'] as List) PublicHoliday(h['date'] as String, h['name'] as String)],
      [for (final f in j['ferien'] as List) SchoolHoliday(f['name'] as String, f['start'] as String, f['end'] as String)],
    );
  }

  Future<HolidayData> _fetch(int year, String land) async {
    final timeout = const Duration(seconds: 15);
    final res = await client.get(Uri.parse('https://date.nager.at/api/v3/PublicHolidays/$year/DE')).timeout(timeout);
    if (res.statusCode != 200) throw Exception('Feiertage: HTTP ${res.statusCode}');
    final county = 'DE-$land';
    final feiertage = [
      for (final h in jsonDecode(utf8.decode(res.bodyBytes)) as List)
        if (h['global'] == true || ((h['counties'] as List?)?.contains(county) ?? false))
          PublicHoliday(h['date'] as String, h['localName'] as String),
    ];

    var ferien = <SchoolHoliday>[];
    try {
      final uri = Uri.https('openholidaysapi.org', '/SchoolHolidays', {
        'countryIsoCode': 'DE',
        'languageIsoCode': 'DE',
        'validFrom': '$year-01-01',
        'validTo': '$year-12-31',
        'subdivisionCode': county,
      });
      final r2 = await client.get(uri).timeout(timeout);
      if (r2.statusCode == 200) {
        ferien = [
          for (final f in jsonDecode(utf8.decode(r2.bodyBytes)) as List)
            SchoolHoliday(
              ((f['name'] as List).firstWhere((n) => n['language'] == 'DE', orElse: () => {'text': 'Ferien'})['text']) as String,
              f['startDate'] as String,
              f['endDate'] as String,
            ),
        ];
      }
    } catch (_) {
      // Schulferien sind optional
    }
    return HolidayData(feiertage, ferien);
  }
}
