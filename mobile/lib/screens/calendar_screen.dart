import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../app_state.dart';
import '../constants.dart';
import '../dates.dart';
import '../holidays.dart';
import '../models.dart';
import '../widgets/sync_indicator.dart';
import 'vacation_editor.dart';

/// Monatskalender: Wochenenden, Feiertage und Schulferien eingefärbt, Urlaube als farbige Balken je Person.
class CalendarScreen extends StatefulWidget {
  const CalendarScreen({super.key});

  @override
  State<CalendarScreen> createState() => _CalendarScreenState();
}

class _CalendarScreenState extends State<CalendarScreen> {
  static const _basis = 1200; // Seitenindex des aktuellen Monats
  final _controller = PageController(initialPage: _basis);
  final _heute = DateTime.now();
  int _seite = _basis;

  DateTime _monat(int seite) => DateTime(_heute.year, _heute.month + seite - _basis);

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = AppScope.of(context);
    final monat = _monat(_seite);
    return Scaffold(
      appBar: AppBar(
        title: Text(DateFormat('MMMM yyyy', 'de_DE').format(monat)),
        actions: [
          const SyncIndicator(),
          IconButton(
            tooltip: 'Vorheriger Monat',
            icon: const Icon(Icons.chevron_left),
            onPressed: () => _controller.previousPage(duration: const Duration(milliseconds: 250), curve: Curves.easeOut),
          ),
          TextButton(
            onPressed: () => _controller.animateToPage(_basis, duration: const Duration(milliseconds: 250), curve: Curves.easeOut),
            child: const Text('Heute'),
          ),
          IconButton(
            tooltip: 'Nächster Monat',
            icon: const Icon(Icons.chevron_right),
            onPressed: () => _controller.nextPage(duration: const Duration(milliseconds: 250), curve: Curves.easeOut),
          ),
        ],
      ),
      floatingActionButton: state.persons.isEmpty
          ? null
          : FloatingActionButton(
              tooltip: 'Urlaub eintragen',
              onPressed: () => showVacationEditor(context, start: DateTime.now()),
              child: const Icon(Icons.add),
            ),
      body: state.persons.isEmpty
          ? const _LeerHinweis()
          : PageView.builder(
              controller: _controller,
              onPageChanged: (s) => setState(() => _seite = s),
              itemBuilder: (context, seite) => _MonthView(monat: _monat(seite)),
            ),
    );
  }
}

class _LeerHinweis extends StatelessWidget {
  const _LeerHinweis();

  @override
  Widget build(BuildContext context) => const Center(
        child: Padding(
          padding: EdgeInsets.all(32),
          child: Text(
            'Noch keine Personen angelegt.\nLege unter „Personen“ die erste Person an oder verbinde dich in den Einstellungen mit deinem Server.',
            textAlign: TextAlign.center,
            style: TextStyle(color: kTextMuted),
          ),
        ),
      );
}

class _MonthView extends StatelessWidget {
  final DateTime monat;
  const _MonthView({required this.monat});

  @override
  Widget build(BuildContext context) {
    final state = AppScope.of(context);
    final holidays = state.holidaysFor(monat.year);
    final feiertage = {for (final h in holidays.feiertage) h.date: h.name};
    final ersterTag = DateTime(monat.year, monat.month, 1);
    final tage = DateTime(monat.year, monat.month + 1, 0).day;
    final versatz = ersterTag.weekday - 1; // Montag = 0
    final zellen = ((versatz + tage) / 7).ceil() * 7;
    final heute = formatDate(DateTime.now());

    return ListView(
      padding: const EdgeInsets.fromLTRB(8, 4, 8, 96),
      children: [
        Row(
          children: [
            for (final t in const ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'])
              Expanded(child: Center(child: Text(t, style: const TextStyle(fontSize: 12, color: kTextFaint)))),
          ],
        ),
        const SizedBox(height: 4),
        GridView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 7, childAspectRatio: 0.72),
          itemCount: zellen,
          itemBuilder: (context, i) {
            final tag = i - versatz + 1;
            if (tag < 1 || tag > tage) return const SizedBox.shrink();
            final datum = DateTime(monat.year, monat.month, tag);
            final key = formatDate(datum);
            return _DayCell(
              datum: datum,
              feiertag: feiertage[key],
              ferien: _ferienAm(holidays, key),
              urlaube: state.vacations.where((v) => coversDay(v, key)).toList(),
              heute: key == heute,
            );
          },
        ),
        const SizedBox(height: 12),
        const _Legende(),
      ],
    );
  }

  static String? _ferienAm(HolidayData h, String key) =>
      h.ferien.where((f) => f.start.compareTo(key) <= 0 && f.end.compareTo(key) >= 0).map((f) => f.name).firstOrNull;
}

class _DayCell extends StatelessWidget {
  final DateTime datum;
  final String? feiertag;
  final String? ferien;
  final List<Vacation> urlaube;
  final bool heute;
  const _DayCell({required this.datum, this.feiertag, this.ferien, required this.urlaube, required this.heute});

  @override
  Widget build(BuildContext context) {
    final state = AppScope.of(context);
    final Color? hintergrund = feiertag != null
        ? kHolidayBg
        : ferien != null
            ? kFerienBg
            : isWeekend(datum)
                ? kWeekendBg
                : null;
    final textFarbe = feiertag != null ? kHolidayText : (ferien != null ? kFerienText : kText);
    return InkWell(
      borderRadius: BorderRadius.circular(8),
      onTap: () => _zeigeTag(context),
      child: Container(
        margin: const EdgeInsets.all(2),
        padding: const EdgeInsets.all(3),
        decoration: BoxDecoration(
          color: hintergrund,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: heute ? kAccent : kBorder, width: heute ? 1.5 : 0.5),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('${datum.day}', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: textFarbe)),
            const SizedBox(height: 2),
            for (final v in urlaube.take(4))
              Builder(builder: (context) {
                final p = state.personById(v.personId);
                if (p == null) return const SizedBox.shrink();
                final halb = isHalfDay(v, p, datum);
                return Container(
                  height: 5,
                  margin: const EdgeInsets.only(bottom: 2),
                  decoration: BoxDecoration(
                    color: personColor(p.color).withValues(alpha: halb ? 0.45 : 1),
                    borderRadius: BorderRadius.circular(3),
                  ),
                );
              }),
            if (urlaube.length > 4) Text('+${urlaube.length - 4}', style: const TextStyle(fontSize: 9, color: kTextMuted)),
          ],
        ),
      ),
    );
  }

  void _zeigeTag(BuildContext context) {
    final state = AppScope.of(context);
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: kSurface,
      showDragHandle: true,
      builder: (sheet) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(DateFormat('EEEE, d. MMMM yyyy', 'de_DE').format(datum),
                  style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
              if (feiertag != null) Padding(padding: const EdgeInsets.only(top: 4), child: Text(feiertag!, style: const TextStyle(color: kHolidayText))),
              if (ferien != null) Padding(padding: const EdgeInsets.only(top: 4), child: Text(ferien!, style: const TextStyle(color: kFerienText))),
              const SizedBox(height: 8),
              if (urlaube.isEmpty) const Text('Kein Urlaub eingetragen.', style: TextStyle(color: kTextMuted)),
              for (final v in urlaube)
                Builder(builder: (_) {
                  final p = state.personById(v.personId);
                  return ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: CircleAvatar(
                      backgroundColor: personColor(p?.color ?? ''),
                      child: Text(personInitials(p?.name ?? '?'), style: const TextStyle(fontSize: 12, color: Color(0xFF04121B))),
                    ),
                    title: Text(p?.name ?? 'Unbekannt'),
                    subtitle: Text([
                      v.isSingleDay
                          ? DateFormat('d.M.yyyy').format(parseDate(v.startDate))
                          : '${DateFormat('d.M.').format(parseDate(v.startDate))} – ${DateFormat('d.M.yyyy').format(parseDate(v.endDate))}',
                      if (v.halfDay) 'halber Tag',
                      if (v.note != null) v.note!,
                    ].join(' · ')),
                    onTap: () {
                      Navigator.pop(sheet);
                      showVacationEditor(context, vacation: v);
                    },
                  );
                }),
              const SizedBox(height: 8),
              FilledButton.icon(
                icon: const Icon(Icons.add),
                label: const Text('Urlaub eintragen'),
                onPressed: () {
                  Navigator.pop(sheet);
                  showVacationEditor(context, start: datum);
                },
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Legende extends StatelessWidget {
  const _Legende();

  @override
  Widget build(BuildContext context) {
    Widget eintrag(Color c, String text) => Row(mainAxisSize: MainAxisSize.min, children: [
          Container(width: 12, height: 12, decoration: BoxDecoration(color: c, borderRadius: BorderRadius.circular(3))),
          const SizedBox(width: 6),
          Text(text, style: const TextStyle(fontSize: 12, color: kTextMuted)),
        ]);
    final state = AppScope.of(context);
    return Wrap(
      spacing: 14,
      runSpacing: 8,
      children: [
        eintrag(kHolidayBg, 'Feiertag'),
        eintrag(kFerienBg, 'Schulferien'),
        eintrag(kWeekendBg, 'Wochenende'),
        for (final p in state.persons) eintrag(personColor(p.color), p.name),
      ],
    );
  }
}
