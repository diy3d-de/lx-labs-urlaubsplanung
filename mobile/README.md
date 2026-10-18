# lx-urlaubsplanung – Mobile-App (Android)

Flutter-App zur Urlaubsplanung: Monatskalender mit Feiertagen und Schulferien, Urlaubskonto, Personen. Funktioniert
eigenständig offline und gleicht sich optional mit der Server-Installation ab (`POST /api/sync`, siehe
[`../src/lib/sync.ts`](../src/lib/sync.ts)).

## Aufbau

| Datei | Zweck |
| --- | --- |
| `lib/local_db.dart` | Lokale SQLite-Datenbank; `dirty`/`local_rev` markieren noch nicht übertragene Änderungen |
| `lib/sync_service.dart` | Abgleich: offene Änderungen senden (mit `baseRev`), Serveränderungen übernehmen, Konflikte (Server gewinnt), Reset bei anderem Server |
| `lib/app_state.dart` | App-Zustand, automatischer Abgleich 2 s nach Änderungen, beim Start und beim Zurückkehren in die App |
| `lib/holidays.dart` | Feiertage (Nager.Date) und Schulferien (OpenHolidays), lokal zwischengespeichert |
| `lib/dates.dart`, `lib/validate.dart` | Urlaubstage-Zählung und Eingabeprüfung – identisch zur Web-App, sonst lehnt der Server den Abgleich ab |
| `lib/update_service.dart` + `MainActivity.kt` | App-Updates aus den GitHub-Releases (APK + SHA-256, Installation über FileProvider) |

## Entwickeln

```bash
flutter pub get
flutter analyze
flutter test
flutter run                       # Emulator oder Gerät
flutter build apk --release       # ohne android/key.properties debug-signiert
```

Im Android-Emulator ist der eigene Rechner unter `10.0.2.2` erreichbar (z. B. Server-Adresse `10.0.2.2:3000`; den
Next-Server dafür mit `next dev -H 0.0.0.0` starten).

## Hinweise

- Die App spricht mit dem Server über HTTP im Heimnetz (`usesCleartextTraffic`); der Server hat keinen Login.
- `applicationId` `dev.lx_labs.urlaubsplanung` und Signaturschlüssel nie ändern, sonst sind keine Updates mehr möglich.
- Release-Builds und Signatur macht der Workflow `Release` (siehe README im Hauptverzeichnis).
