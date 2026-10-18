import 'package:flutter/material.dart';

import '../app_state.dart';
import '../constants.dart';
import '../dates.dart';
import '../widgets/sync_indicator.dart';

/// Urlaubskonto je Person (verfügbar, geplant, übrig) wie in der Web-App (VacationBalance.tsx).
class BalanceScreen extends StatefulWidget {
  const BalanceScreen({super.key});

  @override
  State<BalanceScreen> createState() => _BalanceScreenState();
}

class _BalanceScreenState extends State<BalanceScreen> {
  int _jahr = DateTime.now().year;

  @override
  Widget build(BuildContext context) {
    final state = AppScope.of(context);
    final feiertage = state.holidaysFor(_jahr).feiertage.map((h) => h.date).toSet();
    final personen = state.persons.where((p) => !p.isStudent).toList();

    return Scaffold(
      appBar: AppBar(
        title: Text('Urlaubskonto $_jahr'),
        actions: [
          const SyncIndicator(),
          IconButton(icon: const Icon(Icons.chevron_left), onPressed: () => setState(() => _jahr--)),
          IconButton(icon: const Icon(Icons.chevron_right), onPressed: () => setState(() => _jahr++)),
        ],
      ),
      body: personen.isEmpty
          ? const Center(child: Text('Keine Personen mit Urlaubskonto.', style: TextStyle(color: kTextMuted)))
          : ListView.separated(
              padding: const EdgeInsets.all(12),
              itemCount: personen.length,
              separatorBuilder: (_, _) => const SizedBox(height: 8),
              itemBuilder: (context, i) {
                final p = personen[i];
                final geplant = state.vacations
                    .where((v) => v.personId == p.id && overlapsYear(v, _jahr))
                    .fold<double>(0, (sum, v) => sum + countVacationDays(v, p, feiertage));
                final rest = p.vacationDays - geplant;
                Widget zahl(String label, double wert, {Color? farbe}) => Expanded(
                      child: Column(children: [
                        Text(formatDays(wert), style: TextStyle(fontSize: 20, fontWeight: FontWeight.w600, color: farbe ?? kText)),
                        Text(label, style: const TextStyle(fontSize: 12, color: kTextMuted)),
                      ]),
                    );
                return Card(
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(children: [
                          CircleAvatar(radius: 6, backgroundColor: personColor(p.color)),
                          const SizedBox(width: 8),
                          Text(p.name, style: const TextStyle(fontWeight: FontWeight.w600)),
                        ]),
                        const SizedBox(height: 10),
                        Row(children: [
                          zahl('Verfügbar', p.vacationDays),
                          zahl('Geplant', geplant),
                          zahl('Übrig', rest, farbe: rest < 0 ? kDanger : null),
                        ]),
                      ],
                    ),
                  ),
                );
              },
            ),
    );
  }
}
