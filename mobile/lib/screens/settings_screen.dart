import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../app_state.dart';
import '../constants.dart';
import '../sync_service.dart';
import '../update_service.dart';

class SettingsScreen extends StatefulWidget {
  final UpdateService updates;
  const SettingsScreen({super.key, required this.updates});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  final _server = TextEditingController();
  bool _initialisiert = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!_initialisiert) {
      _initialisiert = true;
      _server.text = AppScope.of(context).serverUrl ?? '';
    }
  }

  @override
  void dispose() {
    _server.dispose();
    super.dispose();
  }

  void _meldung(String text) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));

  Future<void> _verbinden() async {
    final state = AppScope.of(context);
    final uri = SyncService.parseServerUrl(_server.text);
    if (uri == null) {
      _meldung('Ungültige Adresse, z. B. 192.168.178.20:3000');
      return;
    }
    if (uri.toString() != state.serverUrl) await state.setServer(uri.toString());
    _server.text = uri.toString();
    await _abgleichen();
  }

  Future<void> _abgleichen() async {
    final state = AppScope.of(context);
    try {
      if (await state.brauchtErstabgleichEntscheidung()) {
        if (!mounted) return;
        final verwerfen = await showDialog<bool>(
          context: context,
          builder: (d) => AlertDialog(
            title: const Text('Erster Abgleich'),
            content: const Text(
                'Auf diesem Gerät sind schon Daten gespeichert. Sollen sie mit dem Server zusammengeführt werden, '
                'oder sollen nur die Daten vom Server übernommen werden?'),
            actions: [
              TextButton(onPressed: () => Navigator.pop(d), child: const Text('Abbrechen')),
              TextButton(onPressed: () => Navigator.pop(d, true), child: const Text('Nur Server-Daten')),
              FilledButton(onPressed: () => Navigator.pop(d, false), child: const Text('Zusammenführen')),
            ],
          ),
        );
        if (verwerfen == null) return;
        await state.ersterAbgleich(lokaleVerwerfen: verwerfen);
      } else {
        await state.synchronisieren();
      }
      _meldung(state.syncMeldung ?? 'Abgeglichen');
    } catch (e) {
      _meldung('$e');
    }
  }

  Future<void> _trennen() async {
    await AppScope.of(context).setServer(null);
    _server.clear();
    _meldung('Server getrennt - die Daten bleiben auf diesem Gerät.');
  }

  @override
  Widget build(BuildContext context) {
    final state = AppScope.of(context);
    final u = widget.updates;
    return Scaffold(
      appBar: AppBar(title: const Text('Einstellungen')),
      body: ListView(
        padding: const EdgeInsets.all(12),
        children: [
          _Abschnitt(
            titel: 'Feiertage und Schulferien',
            children: [
              DropdownButtonFormField<String>(
                initialValue: state.bundesland,
                decoration: const InputDecoration(labelText: 'Bundesland'),
                items: [for (final e in bundeslaender.entries) DropdownMenuItem(value: e.key, child: Text(e.value))],
                onChanged: (v) => state.setBundesland(v!),
              ),
            ],
          ),
          _Abschnitt(
            titel: 'Abgleich mit Server',
            children: [
              const Text(
                'Optional: Adresse der Urlaubsplanung im Heimnetz (Docker/Server-Installation). '
                'Ohne Server speichert die App alles nur auf diesem Gerät.',
                style: TextStyle(color: kTextMuted, fontSize: 13),
              ),
              const SizedBox(height: 8),
              TextField(
                controller: _server,
                keyboardType: TextInputType.url,
                autocorrect: false,
                decoration: const InputDecoration(labelText: 'Server-Adresse', hintText: '192.168.178.20:3000'),
              ),
              const SizedBox(height: 8),
              Wrap(spacing: 8, runSpacing: 8, children: [
                FilledButton.icon(
                  onPressed: state.syncStatus == SyncStatus.laeuft ? null : _verbinden,
                  icon: const Icon(Icons.sync),
                  label: Text(state.serverUrl == null ? 'Verbinden' : 'Jetzt abgleichen'),
                ),
                if (state.serverUrl != null) OutlinedButton(onPressed: _trennen, child: const Text('Trennen')),
              ]),
              const SizedBox(height: 8),
              if (state.serverUrl != null)
                Text(
                  [
                    if (state.letzterSync != null)
                      'Zuletzt abgeglichen: ${DateFormat('d.M.yyyy HH:mm', 'de_DE').format(state.letzterSync!)}',
                    if (state.offeneAenderungen > 0) '${state.offeneAenderungen} Änderung(en) noch nicht übertragen',
                    if (state.syncStatus == SyncStatus.fehler && state.syncMeldung != null) state.syncMeldung!,
                  ].join('\n'),
                  style: TextStyle(fontSize: 13, color: state.syncStatus == SyncStatus.fehler ? kDanger : kTextMuted),
                ),
            ],
          ),
          _Abschnitt(
            titel: 'App-Version',
            children: [
              Text('Installiert: ${u.appVersion ?? '…'}', style: const TextStyle(color: kTextMuted)),
              const SizedBox(height: 8),
              _UpdateBereich(updates: u, meldung: _meldung),
            ],
          ),
        ],
      ),
    );
  }
}

class _UpdateBereich extends StatelessWidget {
  final UpdateService updates;
  final void Function(String) meldung;
  const _UpdateBereich({required this.updates, required this.meldung});

  @override
  Widget build(BuildContext context) {
    final u = updates;
    switch (u.phase) {
      case UpdatePhase.pruefe:
        return const Text('Suche nach Updates …', style: TextStyle(color: kTextMuted));
      case UpdatePhase.laedt:
        return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('Version ${u.info!.version} wird geladen … ${(u.fortschritt * 100).round()} %'),
          const SizedBox(height: 6),
          LinearProgressIndicator(value: u.fortschritt),
        ]);
      case UpdatePhase.verfuegbar:
      case UpdatePhase.bereit:
        final i = u.info!;
        return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('Version ${i.version} ist verfügbar', style: const TextStyle(fontWeight: FontWeight.w600, color: Color(0xFF34D399))),
          if (i.notes.trim().isNotEmpty)
            Container(
              margin: const EdgeInsets.only(top: 8),
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(color: kBg, borderRadius: BorderRadius.circular(8), border: Border.all(color: kBorder)),
              // Release-Notes immer nur als Text
              child: Text(i.notes.trim(), style: const TextStyle(fontSize: 13, color: kTextMuted)),
            ),
          const SizedBox(height: 8),
          if (u.phase == UpdatePhase.verfuegbar)
            FilledButton.icon(onPressed: u.herunterladen, icon: const Icon(Icons.download), label: Text('Herunterladen (${(i.size / 1048576).toStringAsFixed(0)} MB)'))
          else
            FilledButton.icon(
              onPressed: () async {
                final fehler = await u.installieren();
                if (fehler != null) meldung(fehler);
              },
              icon: const Icon(Icons.system_update),
              label: const Text('Installieren'),
            ),
        ]);
      case UpdatePhase.fehler:
        return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(u.fehler ?? 'Fehler', style: const TextStyle(color: kDanger, fontSize: 13)),
          TextButton(onPressed: u.pruefen, child: const Text('Erneut suchen')),
        ]);
      case UpdatePhase.aktuell:
      case UpdatePhase.unbekannt:
        return Row(children: [
          if (u.phase == UpdatePhase.aktuell) const Text('Die App ist aktuell.', style: TextStyle(color: kTextMuted)),
          const Spacer(),
          TextButton(onPressed: u.pruefen, child: const Text('Nach Updates suchen')),
        ]);
    }
  }
}

class _Abschnitt extends StatelessWidget {
  final String titel;
  final List<Widget> children;
  const _Abschnitt({required this.titel, required this.children});

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: Card(
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Text(titel, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15)),
              const SizedBox(height: 10),
              ...children,
            ]),
          ),
        ),
      );
}
