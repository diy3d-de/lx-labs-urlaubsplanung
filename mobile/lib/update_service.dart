// App-Updates (OTA) für Android: sucht im öffentlichen GitHub-Repo das neueste veröffentlichte Release mit
// lx-urlaubsplanung-<version>.apk und .apk.sha256, lädt die APK, prüft die Prüfsumme und startet die
// Android-Installation. Android installiert ein Update nur, wenn es mit demselben Schlüssel signiert ist.
import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';

import 'constants.dart';
import 'dates.dart';

enum UpdatePhase { unbekannt, pruefe, aktuell, verfuegbar, laedt, bereit, fehler }

class UpdateInfo {
  final String version;
  final String notes;
  final Uri apkUrl;
  final Uri shaUrl;
  final int size;
  const UpdateInfo(this.version, this.notes, this.apkUrl, this.shaUrl, this.size);
}

class UpdateService extends ChangeNotifier {
  static const _channel = MethodChannel('dev.lx_labs.urlaubsplanung/update');
  final http.Client client;
  UpdateService({http.Client? client}) : client = client ?? http.Client();

  UpdatePhase phase = UpdatePhase.unbekannt;
  String? appVersion;
  UpdateInfo? info;
  double fortschritt = 0;
  String? fehler;
  File? _apk;

  void _set(UpdatePhase p, {String? fehlerText}) {
    phase = p;
    fehler = fehlerText;
    notifyListeners();
  }

  Future<String> _version() async => appVersion ??= await _channel.invokeMethod<String>('appVersion') ?? '0.0.0';

  /// Lädt die installierte Version für die Anzeige.
  Future<void> init() async {
    try {
      await _version();
      notifyListeners();
    } on PlatformException {
      // ohne Android-Kanal (z. B. Tests) bleibt die Anzeige leer
    } on MissingPluginException {
      // dito
    }
  }

  /// Sucht nach einer neueren Version. Fehler (z. B. offline) landen nur im Status.
  Future<void> pruefen() async {
    if (phase == UpdatePhase.pruefe || phase == UpdatePhase.laedt) return;
    _set(UpdatePhase.pruefe);
    try {
      final aktuell = await _version();
      final res = await client.get(
        Uri.https('api.github.com', '/repos/$kReleaseOwner/$kReleaseRepo/releases/latest'),
        headers: {'Accept': 'application/vnd.github+json'},
      ).timeout(const Duration(seconds: 15));
      if (res.statusCode == 404) {
        _set(UpdatePhase.aktuell); // noch kein veröffentlichtes Release
        return;
      }
      if (res.statusCode != 200) throw Exception('GitHub: HTTP ${res.statusCode}');
      final release = jsonDecode(utf8.decode(res.bodyBytes)) as Map<String, dynamic>;
      final version = (release['tag_name'] as String).replaceFirst(RegExp(r'^v'), '');
      if (!RegExp(r'^\d+\.\d+\.\d+$').hasMatch(version) || compareVersions(version, aktuell) <= 0) {
        _set(UpdatePhase.aktuell);
        return;
      }
      Map<String, dynamic>? asset(String name) =>
          (release['assets'] as List).cast<Map<String, dynamic>>().where((a) => a['name'] == name).firstOrNull;
      final apk = asset('lx-urlaubsplanung-$version.apk');
      final sha = asset('lx-urlaubsplanung-$version.apk.sha256');
      if (apk == null || sha == null) {
        _set(UpdatePhase.aktuell); // Release ohne Android-App
        return;
      }
      info = UpdateInfo(
        version,
        (release['body'] as String?) ?? '',
        Uri.parse(apk['browser_download_url'] as String),
        Uri.parse(sha['browser_download_url'] as String),
        (apk['size'] as num).toInt(),
      );
      _set(UpdatePhase.verfuegbar);
    } on SocketException {
      _set(UpdatePhase.fehler, fehlerText: 'Keine Verbindung zum Update-Server');
    } catch (e) {
      _set(UpdatePhase.fehler, fehlerText: 'Update-Prüfung fehlgeschlagen: $e');
    }
  }

  /// Lädt die APK herunter und prüft die SHA-256-Prüfsumme.
  Future<void> herunterladen() async {
    final i = info;
    if (i == null || phase == UpdatePhase.laedt) return;
    fortschritt = 0;
    _set(UpdatePhase.laedt);
    try {
      final shaRes = await client.get(i.shaUrl).timeout(const Duration(seconds: 30));
      if (shaRes.statusCode != 200) throw Exception('Prüfsumme nicht ladbar (HTTP ${shaRes.statusCode})');
      final erwartet = utf8.decode(shaRes.bodyBytes).trim().split(RegExp(r'\s+')).first.toLowerCase();
      if (!RegExp(r'^[0-9a-f]{64}$').hasMatch(erwartet)) throw Exception('Prüfsummendatei ungültig');

      final dir = Directory('${(await getApplicationCacheDirectory()).path}/updates');
      if (await dir.exists()) await dir.delete(recursive: true);
      await dir.create(recursive: true);
      final file = File('${dir.path}/update.apk');

      final res = await client.send(http.Request('GET', i.apkUrl));
      if (res.statusCode != 200) throw Exception('Download fehlgeschlagen (HTTP ${res.statusCode})');
      final gesamt = res.contentLength ?? i.size;
      final sink = file.openWrite();
      final hashSink = _DigestSink();
      final hasher = sha256.startChunkedConversion(hashSink);
      var geladen = 0;
      await for (final chunk in res.stream) {
        sink.add(chunk);
        hasher.add(chunk);
        geladen += chunk.length;
        if (gesamt > 0) {
          fortschritt = geladen / gesamt;
          notifyListeners();
        }
      }
      await sink.close();
      hasher.close();
      if (hashSink.value.toString() != erwartet) {
        await file.delete();
        throw Exception('Prüfsumme stimmt nicht - Download verworfen');
      }
      _apk = file;
      _set(UpdatePhase.bereit);
    } catch (e) {
      _set(UpdatePhase.fehler, fehlerText: '$e'.replaceFirst('Exception: ', ''));
    }
  }

  /// Startet die Android-Installation. Ohne Erlaubnis „Unbekannte Apps installieren“ öffnet Android zuerst
  /// die Einstellung; danach erneut tippen.
  Future<String?> installieren() async {
    final apk = _apk;
    if (apk == null || phase != UpdatePhase.bereit) return 'Kein geladenes Update vorhanden';
    try {
      final ergebnis = await _channel.invokeMethod<String>('installApk', {'path': apk.path});
      return ergebnis == 'permission'
          ? 'Bitte „Apps aus dieser Quelle zulassen“ aktivieren und dann erneut auf Installieren tippen.'
          : null;
    } on PlatformException catch (e) {
      return 'Installation nicht möglich: ${e.message}';
    }
  }
}

class _DigestSink implements Sink<Digest> {
  late Digest value;
  @override
  void add(Digest data) => value = data;
  @override
  void close() {}
}
