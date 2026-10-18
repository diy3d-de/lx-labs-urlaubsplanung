import 'package:flutter/material.dart';

import '../app_state.dart';
import '../constants.dart';

/// Kleines Wolken-Symbol in der Kopfzeile: Abgleichstatus, Tippen gleicht sofort ab.
class SyncIndicator extends StatelessWidget {
  const SyncIndicator({super.key});

  @override
  Widget build(BuildContext context) {
    final state = AppScope.of(context);
    if (state.syncStatus == SyncStatus.aus) return const SizedBox.shrink();
    if (state.syncStatus == SyncStatus.laeuft) {
      return const Padding(
        padding: EdgeInsets.all(14),
        child: SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)),
      );
    }
    final fehler = state.syncStatus == SyncStatus.fehler;
    return IconButton(
      tooltip: fehler ? 'Abgleich fehlgeschlagen: ${state.syncMeldung}' : 'Jetzt abgleichen',
      icon: Icon(
        fehler ? Icons.cloud_off : (state.offeneAenderungen > 0 ? Icons.cloud_upload_outlined : Icons.cloud_done_outlined),
        // wie der „online“-Punkt auf lx-labs.dev: Terminal-Grün, wenn alles abgeglichen ist
        color: fehler ? kDanger : (state.offeneAenderungen > 0 ? kTextMuted : kTerminal),
      ),
      onPressed: () async {
        final messenger = ScaffoldMessenger.of(context);
        try {
          await state.synchronisieren();
          messenger.showSnackBar(SnackBar(content: Text(state.syncMeldung ?? 'Abgeglichen')));
        } catch (e) {
          messenger.showSnackBar(SnackBar(content: Text('$e')));
        }
      },
    );
  }
}
