import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../app_state.dart';
import '../constants.dart';
import '../dates.dart';
import '../models.dart';
import '../validate.dart';

/// Urlaub anlegen oder bearbeiten.
Future<void> showVacationEditor(BuildContext context, {Vacation? vacation, DateTime? start}) => showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: kSurface,
      showDragHandle: true,
      builder: (_) => AppScope(
        state: AppScope.of(context),
        child: _VacationEditor(vacation: vacation, start: start),
      ),
    );

class _VacationEditor extends StatefulWidget {
  final Vacation? vacation;
  final DateTime? start;
  const _VacationEditor({this.vacation, this.start});

  @override
  State<_VacationEditor> createState() => _VacationEditorState();
}

class _VacationEditorState extends State<_VacationEditor> {
  late String _personId;
  late DateTime _von;
  late DateTime _bis;
  late bool _halb;
  late final TextEditingController _notiz;
  String? _fehler;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_initialisiert) return;
    _initialisiert = true;
    final state = AppScope.of(context);
    final v = widget.vacation;
    _personId = v?.personId ?? state.persons.first.id;
    _von = v != null ? parseDate(v.startDate) : DateUtils.dateOnly(widget.start ?? DateTime.now());
    _bis = v != null ? parseDate(v.endDate) : _von;
    _halb = v?.halfDay ?? false;
    _notiz = TextEditingController(text: v?.note ?? '');
  }

  bool _initialisiert = false;

  @override
  void dispose() {
    _notiz.dispose();
    super.dispose();
  }

  Future<void> _waehle(bool von) async {
    final d = await showDatePicker(
      context: context,
      initialDate: von ? _von : _bis,
      firstDate: DateTime(1900),
      lastDate: DateTime(2100, 12, 31),
    );
    if (d == null) return;
    setState(() {
      if (von) {
        _von = d;
        if (_bis.isBefore(d)) _bis = d;
      } else {
        _bis = d;
        if (_von.isAfter(d)) _von = d;
      }
    });
  }

  Future<void> _speichern() async {
    final state = AppScope.of(context);
    final notizFehler = checkNote(_notiz.text);
    if (notizFehler != null) {
      setState(() => _fehler = notizFehler);
      return;
    }
    final note = sanitizeText(_notiz.text);
    final start = formatDate(_von), end = formatDate(_bis);
    final base = widget.vacation ?? state.newVacation(personId: _personId, start: start, end: end);
    await state.saveVacation(Vacation(
      id: base.id,
      personId: _personId,
      startDate: start,
      endDate: end,
      halfDay: start == end && _halb,
      note: note.isEmpty ? null : note,
      rev: base.rev,
    ));
    if (mounted) Navigator.pop(context);
  }

  Future<void> _loeschen() async {
    final state = AppScope.of(context);
    final ok = await showDialog<bool>(
      context: context,
      builder: (d) => AlertDialog(
        title: const Text('Urlaub löschen?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(d, false), child: const Text('Abbrechen')),
          FilledButton(onPressed: () => Navigator.pop(d, true), child: const Text('Löschen')),
        ],
      ),
    );
    if (ok != true) return;
    await state.deleteVacation(widget.vacation!);
    if (mounted) Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    final state = AppScope.of(context);
    final person = state.personById(_personId);
    final feiertage = {
      for (var y = _von.year; y <= _bis.year; y++) ...state.holidaysFor(y).feiertage.map((h) => h.date),
    };
    final einzeltag = DateUtils.isSameDay(_von, _bis);
    final tage = person == null
        ? 0.0
        : countVacationDays(
            Vacation(id: '', personId: _personId, startDate: formatDate(_von), endDate: formatDate(_bis), halfDay: einzeltag && _halb),
            person,
            feiertage,
          );
    final df = DateFormat('EEE, d.M.yyyy', 'de_DE');

    return Padding(
      padding: EdgeInsets.fromLTRB(16, 0, 16, MediaQuery.of(context).viewInsets.bottom + 16),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(widget.vacation == null ? 'Urlaub eintragen' : 'Urlaub bearbeiten',
                style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: _personId,
              decoration: const InputDecoration(labelText: 'Person'),
              items: [
                for (final p in state.persons)
                  DropdownMenuItem(
                    value: p.id,
                    child: Row(children: [
                      CircleAvatar(radius: 6, backgroundColor: personColor(p.color)),
                      const SizedBox(width: 8),
                      Text(p.name),
                    ]),
                  ),
              ],
              onChanged: (v) => setState(() => _personId = v!),
            ),
            const SizedBox(height: 12),
            Row(children: [
              Expanded(
                child: OutlinedButton.icon(
                  icon: const Icon(Icons.event),
                  label: Text('Von: ${df.format(_von)}'),
                  onPressed: () => _waehle(true),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: OutlinedButton.icon(
                  icon: const Icon(Icons.event),
                  label: Text('Bis: ${df.format(_bis)}'),
                  onPressed: () => _waehle(false),
                ),
              ),
            ]),
            if (einzeltag)
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Halber Tag'),
                value: _halb,
                onChanged: (v) => setState(() => _halb = v),
              ),
            TextField(
              controller: _notiz,
              maxLength: 200,
              decoration: InputDecoration(labelText: 'Notiz (optional)', errorText: _fehler),
            ),
            if (person != null && !person.isStudent)
              Text('Angerechnet: ${formatDays(tage)} Urlaubstag(e)', style: const TextStyle(color: kTextMuted)),
            const SizedBox(height: 16),
            Row(children: [
              if (widget.vacation != null)
                TextButton.icon(
                  onPressed: _loeschen,
                  icon: const Icon(Icons.delete_outline, color: kDanger),
                  label: const Text('Löschen', style: TextStyle(color: kDanger)),
                ),
              const Spacer(),
              TextButton(onPressed: () => Navigator.pop(context), child: const Text('Abbrechen')),
              const SizedBox(width: 8),
              FilledButton(onPressed: _speichern, child: const Text('Speichern')),
            ]),
          ],
        ),
      ),
    );
  }
}
