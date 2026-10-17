# Urlaubsplanung

Urlaubs- und Ferienplaner für Familien und kleine Teams: Jahresplaner mit gesetzlichen Feiertagen und
Schulferien je Bundesland, Urlaubskonto pro Person und Export in den eigenen Kalender.

Ein Projekt von [lx-labs.dev](https://lx-labs.dev).

![Jahresansicht mit Urlaubskonto, Feiertagen und Schulferien](docs/screenshot-jahresansicht.png)

## Funktionen

- **Kalenderansichten** Monat, Quartal, Halbjahr und Jahr im Jahresplaner-Stil; Urlaub per Klicken und Ziehen eintragen
- **Feiertage und Schulferien** für alle 16 Bundesländer (Daten: [Nager.Date](https://date.nager.at) und
  [OpenHolidays API](https://www.openholidaysapi.org))
- **Urlaubskonto** je Person (verfügbar, geplant, übrig): Wochenenden und Feiertage zählen nicht mit, halbe Tage
  sind möglich, 24.12. und 31.12. wahlweise als halbe Tage
- **Schüler-Status** für Kinder, die kein Urlaubskonto brauchen
- **Drucken / PDF** im Querformat
- **Backup** als JSON exportieren und wieder importieren (zusammenführen oder ersetzen)
- **Kalender-Export (.ics)** für Outlook, Google oder Apple Kalender

![Menü „Daten“ mit Backup und Kalender-Export](docs/screenshot-daten-menue.png)

## Wichtig: kein Login

Die App hat bewusst keine Benutzerverwaltung. Wer sie erreicht, kann alle Einträge sehen, ändern und löschen.
Betreibe sie deshalb nur im eigenen Netz oder hinter einem Zugangsschutz (z. B. Reverse-Proxy mit Basic Auth) –
nicht offen im Internet.

## Schnellstart mit Docker

```bash
git clone https://github.com/diy3d-de/lx-labs-urlaubsplanung.git
cd lx-labs-urlaubsplanung
docker compose up -d
```

Danach läuft die App unter <http://localhost:3000>. Die Datenbank liegt im Docker-Volume `urlaubsplanung-data`.

## Installation ohne Docker

Voraussetzung: Node.js 20 oder neuer.

```bash
git clone https://github.com/diy3d-de/lx-labs-urlaubsplanung.git
cd lx-labs-urlaubsplanung
npm ci
cp .env.example .env
npx prisma generate
npx prisma migrate deploy   # legt die SQLite-Datenbank prisma/dev.db an
npm run build
npm run start               # Standard-Port 3000, änderbar über PORT
```

Für die Entwicklung reicht nach `npx prisma migrate deploy` ein `npm run dev`.

**Zum Ausprobieren:** Die Datei [`docs/beispieldaten.json`](docs/beispieldaten.json) enthält erfundene Personen und
Urlaube. Sie lässt sich über **Daten → Backup importieren** einspielen.

## Desktop-App (Windows)

Die App lässt sich als eigenständige Windows-Anwendung mit Electron bauen. Sie startet den Server lokal auf
`127.0.0.1` mit einem zufälligen freien Port und ist damit von außen nicht erreichbar.

```bash
npm run icons          # nur nach Änderungen an electron/icon.svg
npm run desktop:dist   # Next-Build + Installer und Portable-EXE in dist/
```

Ergebnis: `dist/lx-urlaubsplanung Setup <version>.exe` (Installer) und `dist/lx-urlaubsplanung-<version>-portable.exe`.
Die Datenbank liegt unter `%APPDATA%\lx-urlaubsplanung\urlaubsplanung.db`. Zum Testen ohne Installer:
`npm run desktop:prepare && npm run desktop:start`.

## Konfiguration

| Variable | Zweck | Standard |
| --- | --- | --- |
| `DATABASE_URL` | Datenbank für die Prisma-CLI (Migrationen) | `file:./dev.db` (= `prisma/dev.db`) |
| `SQLITE_PATH` | Datenbankdatei der laufenden App | `prisma/dev.db` |
| `PORT` | HTTP-Port | `3000` |

## Datensicherung

Alle Daten liegen in einer SQLite-Datei. Über **Daten → Backup exportieren** lässt sich jederzeit eine JSON-Sicherung
herunterladen und später wieder einspielen.

## Technik

Next.js 16 · React 19 · Tailwind CSS 4 · Prisma 6 mit SQLite (better-sqlite3) · date-fns · lucide-react

## Lizenz

[MIT](LICENSE)
