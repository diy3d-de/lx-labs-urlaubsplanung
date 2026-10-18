import 'package:flutter/material.dart';

import '../app_state.dart';
import '../constants.dart';
import '../dates.dart';
import '../models.dart';
import '../validate.dart';
import '../widgets/sync_indicator.dart';

class PersonsScreen extends StatelessWidget {
  const PersonsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final state = AppScope.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Personen'), actions: const [SyncIndicator()]),
      floatingActionButton: FloatingActionButton(
        tooltip: 'Person hinzufügen',
        onPressed: () => showPersonEditor(context),
        child: const Icon(Icons.person_add_alt_1),
      ),
      body: state.persons.isEmpty
          ? const Center(child: Text('Noch keine Personen angelegt.', style: TextStyle(color: kTextMuted)))
          : ListView.separated(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 96),
              itemCount: state.persons.length,
              separatorBuilder: (_, _) => const SizedBox(height: 8),
              itemBuilder: (context, i) {
                final p = state.persons[i];
                return Card(
                  child: ListTile(
                    leading: CircleAvatar(
                      backgroundColor: personColor(p.color),
                      child: Text(personInitials(p.name), style: const TextStyle(fontSize: 13, color: kOnAccent)),
                    ),
                    title: Text(p.name),
                    subtitle: Text(p.isStudent ? 'Schüler' : 'Anspruch ${formatDays(p.vacationDays)} Tage'),
                    trailing: const Icon(Icons.edit_outlined, size: 18, color: kTextFaint),
                    onTap: () => showPersonEditor(context, person: p),
                  ),
                );
              },
            ),
    );
  }
}

Future<void> showPersonEditor(BuildContext context, {Person? person}) => showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: kSurface,
      showDragHandle: true,
      builder: (_) => AppScope(state: AppScope.of(context), child: _PersonEditor(person: person)),
    );

class _PersonEditor extends StatefulWidget {
  final Person? person;
  const _PersonEditor({this.person});

  @override
  State<_PersonEditor> createState() => _PersonEditorState();
}

class _PersonEditorState extends State<_PersonEditor> {
  late final TextEditingController _name = TextEditingController(text: widget.person?.name ?? '');
  late final TextEditingController _tage =
      TextEditingController(text: formatDays(widget.person?.vacationDays ?? 30));
  late bool _schueler = widget.person?.isStudent ?? false;
  late bool _heiligabend = widget.person?.heiligabendHalf ?? true;
  late bool _silvester = widget.person?.silvesterHalf ?? true;
  String? _farbe;
  String? _nameFehler;
  String? _tageFehler;

  @override
  void dispose() {
    _name.dispose();
    _tage.dispose();
    super.dispose();
  }

  Future<void> _speichern() async {
    final state = AppScope.of(context);
    final tage = double.tryParse(_tage.text.trim().replaceAll(',', '.'));
    setState(() {
      _nameFehler = checkName(_name.text);
      _tageFehler = _schueler ? null : checkVacationDays(tage);
    });
    if (_nameFehler != null || _tageFehler != null) return;
    final name = sanitizeText(_name.text);
    final basis = widget.person ?? state.newPerson(name: name);
    await state.savePerson(basis.copyWith(
      name: name,
      isStudent: _schueler,
      color: _farbe ?? basis.color,
      vacationDays: _schueler ? basis.vacationDays : tage,
      heiligabendHalf: _heiligabend,
      silvesterHalf: _silvester,
    ));
    if (mounted) Navigator.pop(context);
  }

  Future<void> _loeschen() async {
    final state = AppScope.of(context);
    final p = widget.person!;
    final ok = await showDialog<bool>(
      context: context,
      builder: (d) => AlertDialog(
        title: Text('${p.name} löschen?'),
        content: const Text('Alle Urlaube dieser Person werden ebenfalls gelöscht.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(d, false), child: const Text('Abbrechen')),
          FilledButton(onPressed: () => Navigator.pop(d, true), child: const Text('Löschen')),
        ],
      ),
    );
    if (ok != true) return;
    await state.deletePerson(p);
    if (mounted) Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    final state = AppScope.of(context);
    final aktuelleFarbe = _farbe ?? widget.person?.color ?? paletteVar(state.persons.length);
    return Padding(
      padding: EdgeInsets.fromLTRB(16, 0, 16, MediaQuery.of(context).viewInsets.bottom + 16),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(widget.person == null ? 'Person hinzufügen' : 'Person bearbeiten',
                style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
            const SizedBox(height: 12),
            TextField(
              controller: _name,
              autofocus: widget.person == null,
              maxLength: 80,
              decoration: InputDecoration(labelText: 'Name', errorText: _nameFehler),
            ),
            const Text('Farbe', style: TextStyle(color: kTextMuted, fontSize: 12)),
            const SizedBox(height: 6),
            Wrap(
              spacing: 10,
              runSpacing: 10,
              children: [
                for (var i = 0; i < personPalette.length; i++)
                  GestureDetector(
                    onTap: () => setState(() => _farbe = paletteVar(i)),
                    child: CircleAvatar(
                      radius: 16,
                      backgroundColor: personPalette[i],
                      child: personColor(aktuelleFarbe) == personPalette[i]
                          ? const Icon(Icons.check, size: 18, color: kOnAccent)
                          : null,
                    ),
                  ),
              ],
            ),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Schüler (kein Urlaubskonto)'),
              value: _schueler,
              onChanged: (v) => setState(() => _schueler = v),
            ),
            if (!_schueler) ...[
              TextField(
                controller: _tage,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                decoration: InputDecoration(labelText: 'Urlaubsanspruch pro Jahr (Tage)', errorText: _tageFehler),
              ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('24.12. zählt als halber Tag'),
                value: _heiligabend,
                onChanged: (v) => setState(() => _heiligabend = v),
              ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('31.12. zählt als halber Tag'),
                value: _silvester,
                onChanged: (v) => setState(() => _silvester = v),
              ),
            ],
            const SizedBox(height: 12),
            Row(children: [
              if (widget.person != null)
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
