// Gleiche Regeln wie auf dem Server (src/lib/validate.ts): Ein ungültiger Datensatz würde dort den ganzen
// Abgleich ablehnen, deshalb wird schon beim Speichern genauso geprüft und bereinigt.

// Tab, LF, CR, NEL, Zeilen-/Absatztrenner → Leerzeichen
const _lineBreaks = {0x09, 0x0a, 0x0d, 0x85, 0x2028, 0x2029};
// Bidi-Steuerzeichen entfallen
const _bidi = {0x200e, 0x200f, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069};

String sanitizeText(String value) {
  final out = StringBuffer();
  for (final cp in value.runes) {
    if (_lineBreaks.contains(cp)) {
      out.write(' ');
    } else if (cp >= 0x20 && (cp < 0x7f || cp > 0x9f) && !_bidi.contains(cp)) {
      out.writeCharCode(cp);
    }
  }
  return out.toString().trim();
}

/// Fehlertext oder null. Länge in UTF-16-Einheiten wie JavaScript (string.length).
String? checkName(String name) {
  final s = sanitizeText(name);
  if (s.isEmpty) return 'Name darf nicht leer sein';
  if (s.length > 80) return 'Höchstens 80 Zeichen';
  return null;
}

String? checkNote(String note) => sanitizeText(note).length > 200 ? 'Höchstens 200 Zeichen' : null;

String? checkVacationDays(double? n) {
  if (n == null || n.isNaN || n < 0 || n > 365 || (n * 2).roundToDouble() != n * 2) {
    return '0 bis 365, halbe Tage erlaubt';
  }
  return null;
}
