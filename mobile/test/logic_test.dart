// Fachlogik: Urlaubstage-Zählung (wie src/lib/vacationDays.ts), Versionsvergleich und Validierung (wie
// src/lib/validate.ts im Server-Projekt).
import 'package:flutter_test/flutter_test.dart';
import 'package:lx_urlaubsplanung/constants.dart';
import 'package:lx_urlaubsplanung/dates.dart';
import 'package:lx_urlaubsplanung/models.dart';
import 'package:lx_urlaubsplanung/validate.dart';

void main() {
  const anna = Person(id: 'a', name: 'Anna', color: 'var(--p0)');
  Vacation v(String s, String e, {bool half = false}) => Vacation(id: 'v', personId: 'a', startDate: s, endDate: e, halfDay: half);

  group('Urlaubstage', () {
    test('Wochenenden zählen nicht', () {
      // Mo 3.8.2026 bis So 16.8.2026 = 10 Arbeitstage
      expect(countVacationDays(v('2026-08-03', '2026-08-16'), anna, {}), 10);
    });

    test('Feiertage zählen nicht', () {
      expect(countVacationDays(v('2026-12-21', '2026-12-25'), anna, {'2026-12-25'}), 3.5); // 24.12. halb
    });

    test('24.12. und 31.12. je nach Einstellung', () {
      final ganz = anna.copyWith(heiligabendHalf: false, silvesterHalf: false);
      expect(countVacationDays(v('2026-12-28', '2026-12-31'), anna, {}), 3.5);
      expect(countVacationDays(v('2026-12-28', '2026-12-31'), ganz, {}), 4);
    });

    test('Einzeltag halb', () {
      expect(countVacationDays(v('2026-08-04', '2026-08-04', half: true), anna, {}), 0.5);
      expect(countVacationDays(v('2026-08-08', '2026-08-08', half: true), anna, {}), 0); // Samstag
    });

    test('Jahresüberschneidung und Tagesabdeckung', () {
      final x = v('2026-12-28', '2027-01-05');
      expect(overlapsYear(x, 2026), isTrue);
      expect(overlapsYear(x, 2027), isTrue);
      expect(overlapsYear(x, 2025), isFalse);
      expect(coversDay(x, '2027-01-01'), isTrue);
      expect(coversDay(x, '2027-01-06'), isFalse);
    });

    test('Anzeige', () {
      expect(formatDays(3), '3');
      expect(formatDays(3.5), '3,5');
    });
  });

  test('Versionsvergleich', () {
    expect(compareVersions('0.3.0', '0.2.9'), greaterThan(0));
    expect(compareVersions('v1.0.0', '1.0.0'), 0);
    expect(compareVersions('0.10.0', '0.9.0'), greaterThan(0));
    expect(compareVersions('0.2.0', '0.2.1'), lessThan(0));
  });

  group('Validierung wie auf dem Server', () {
    test('Bereinigung', () {
      expect(sanitizeText('  Anna\tMaria\n '), 'Anna Maria');
      expect(sanitizeText(String.fromCharCodes([0x41, 0x202e, 0x42, 0x07, 0x43])), 'ABC');
    });

    test('Name und Notiz', () {
      expect(checkName('   '), isNotNull);
      expect(checkName('x' * 80), isNull);
      expect(checkName('x' * 81), isNotNull);
      expect(checkNote('x' * 201), isNotNull);
    });

    test('Urlaubsanspruch', () {
      expect(checkVacationDays(30), isNull);
      expect(checkVacationDays(27.5), isNull);
      expect(checkVacationDays(27.3), isNotNull);
      expect(checkVacationDays(-1), isNotNull);
      expect(checkVacationDays(null), isNotNull);
    });
  });

  test('Personenfarben', () {
    expect(personColor('var(--p3)'), personPalette[3]);
    expect(personColor('#ff0000').toARGB32(), 0xFFFF0000);
    expect(personInitials('Anna Maria Müller'), 'AM');
    expect(personInitials('ben'), 'BE');
  });
}
