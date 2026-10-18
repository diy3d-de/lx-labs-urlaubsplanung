// Kalendertage als "YYYY-MM-DD" (zeitzonenunabhängig) und Urlaubstage-Zählung wie in der Web-App
// (src/lib/vacationDays.ts): Wochenenden und gesetzliche Feiertage zählen nicht.
import 'models.dart';

String formatDate(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

DateTime parseDate(String s) {
  final p = s.split('-').map(int.parse).toList();
  return DateTime(p[0], p[1], p[2]);
}

bool isWeekend(DateTime d) => d.weekday == DateTime.saturday || d.weekday == DateTime.sunday;

/// true, wenn dieser Tag innerhalb des Eintrags nur als halber Urlaubstag zählt.
bool isHalfDay(Vacation v, Person p, DateTime day) {
  if (v.isSingleDay) return v.halfDay;
  final heiligabend = day.month == 12 && day.day == 24;
  final silvester = day.month == 12 && day.day == 31;
  return (heiligabend && p.heiligabendHalf) || (silvester && p.silvesterHalf);
}

/// Angerechnete Urlaubstage eines Eintrags.
double countVacationDays(Vacation v, Person p, Set<String> holidayDates) {
  final end = parseDate(v.endDate);
  var total = 0.0;
  for (var d = parseDate(v.startDate); !d.isAfter(end); d = DateTime(d.year, d.month, d.day + 1)) {
    if (isWeekend(d) || holidayDates.contains(formatDate(d))) continue;
    total += isHalfDay(v, p, d) ? 0.5 : 1;
  }
  return total;
}

/// Überschneidet sich der Eintrag mit dem Jahr?
bool overlapsYear(Vacation v, int year) => v.startDate.compareTo('$year-12-31') <= 0 && v.endDate.compareTo('$year-01-01') >= 0;

bool coversDay(Vacation v, String day) => v.startDate.compareTo(day) <= 0 && v.endDate.compareTo(day) >= 0;

String formatDays(double n) => n == n.roundToDouble() ? n.toInt().toString() : n.toStringAsFixed(1).replaceAll('.', ',');

/// Vergleich von Versionsnummern "1.2.3" (ohne Vorabkennung); negativ, wenn a < b.
int compareVersions(String a, String b) {
  List<int> teile(String v) => v.replaceFirst(RegExp(r'^v'), '').split(RegExp(r'[.+-]')).take(3).map((x) => int.tryParse(x) ?? 0).toList();
  final x = teile(a), y = teile(b);
  for (var i = 0; i < 3; i++) {
    final c = (i < x.length ? x[i] : 0).compareTo(i < y.length ? y[i] : 0);
    if (c != 0) return c;
  }
  return 0;
}
