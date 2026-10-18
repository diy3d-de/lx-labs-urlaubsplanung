import 'package:flutter/material.dart';

const bundeslaender = <String, String>{
  'BW': 'Baden-Württemberg',
  'BY': 'Bayern',
  'BE': 'Berlin',
  'BB': 'Brandenburg',
  'HB': 'Bremen',
  'HH': 'Hamburg',
  'HE': 'Hessen',
  'MV': 'Mecklenburg-Vorpommern',
  'NI': 'Niedersachsen',
  'NW': 'Nordrhein-Westfalen',
  'RP': 'Rheinland-Pfalz',
  'SL': 'Saarland',
  'SN': 'Sachsen',
  'ST': 'Sachsen-Anhalt',
  'SH': 'Schleswig-Holstein',
  'TH': 'Thüringen',
};

/// Personenfarben wie in der Web-App (globals.css: --p0 … --p9). Gespeichert wird "var(--pN)".
const personPalette = <Color>[
  Color(0xFF38BDF8),
  Color(0xFF34D399),
  Color(0xFFFBBF24),
  Color(0xFFFB7185),
  Color(0xFFA78BFA),
  Color(0xFFF472B6),
  Color(0xFFA3E635),
  Color(0xFFFB923C),
  Color(0xFF2DD4BF),
  Color(0xFF818CF8),
];

String paletteVar(int i) => 'var(--p${i % personPalette.length})';

Color personColor(String value) {
  final v = RegExp(r'^var\(--p(\d)\)$').firstMatch(value);
  if (v != null) return personPalette[int.parse(v.group(1)!) % personPalette.length];
  final hex = RegExp(r'^#([0-9a-fA-F]{6})$').firstMatch(value);
  if (hex != null) return Color(0xFF000000 | int.parse(hex.group(1)!, radix: 16));
  return personPalette[0];
}

String personInitials(String name) {
  final parts = name.trim().split(RegExp(r'\s+')).where((s) => s.isNotEmpty).toList();
  if (parts.isEmpty) return '?';
  if (parts.length == 1) return parts.first.characters.take(2).toString().toUpperCase();
  return (parts.first.characters.first + parts.last.characters.first).toUpperCase();
}

// Farben der Web-App (dunkles Design)
const kBg = Color(0xFF0B0E14);
const kSurface = Color(0xFF141922);
const kSurface2 = Color(0xFF1B212C);
const kBorder = Color(0xFF262D3A);
const kText = Color(0xFFE8EBF1);
const kTextMuted = Color(0xFF929CAE);
const kTextFaint = Color(0xFF5C6577);
const kAccent = Color(0xFF38BDF8);
const kDanger = Color(0xFFFB7185);
const kWeekendBg = Color(0x296482AA);
const kHolidayBg = Color(0x3DF43F5E);
const kHolidayText = Color(0xFFFDA4AF);
const kFerienBg = Color(0x47D99B0F);
const kFerienText = Color(0xFFFCD34D);

/// Release-Repo der App-Updates (wie electron/updateKonfig.cjs)
const kReleaseOwner = 'diy3d-de';
const kReleaseRepo = 'lx-labs-urlaubsplanung';
