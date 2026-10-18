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

// Farben und Schriften von lx-labs.dev (canvas, card, line, cyber, neural, terminal, fg, muted)
const kBg = Color(0xFF090A0F);
const kSurface = Color(0xFF13161F);
const kSurface2 = Color(0xFF1A1E29);
const kBorder = Color(0xFF242936);
const kText = Color(0xFFE6E8EE);
const kTextMuted = Color(0xFF8B93A7);
const kTextFaint = Color(0xFF5D6578);
const kAccent = Color(0xFF00F0FF); // cyber
const kNeural = Color(0xFF7C3AED);
const kTerminal = Color(0xFF10B981);
const kDanger = Color(0xFFFF5F57);
const kOnAccent = Color(0xFF04121B);

const kFontSans = 'Inter';
const kFontMono = 'JetBrainsMono';

const kWeekendBg = Color(0x296482AA);
const kHolidayBg = Color(0x3DF43F5E);
const kHolidayText = Color(0xFFFDA4AF);
const kFerienBg = Color(0x47D99B0F);
const kFerienText = Color(0xFFFCD34D);

/// Release-Repo der App-Updates (wie electron/updateKonfig.cjs)
const kReleaseOwner = 'diy3d-de';
const kReleaseRepo = 'lx-labs-urlaubsplanung';

/// Seitenhintergrund mit violett-cyanem Schimmer oben, wie auf lx-labs.dev.
class LxBackground extends StatelessWidget {
  final Widget child;
  const LxBackground({super.key, required this.child});

  @override
  Widget build(BuildContext context) => DecoratedBox(
        decoration: const BoxDecoration(color: kBg),
        child: DecoratedBox(
          decoration: BoxDecoration(
            gradient: RadialGradient(
              center: const Alignment(-0.4, -1.15),
              radius: 1.1,
              colors: [kNeural.withValues(alpha: 0.30), kNeural.withValues(alpha: 0.0)],
            ),
          ),
          child: DecoratedBox(
            decoration: BoxDecoration(
              gradient: RadialGradient(
                center: const Alignment(0.8, -1.1),
                radius: 0.8,
                colors: [kAccent.withValues(alpha: 0.09), kAccent.withValues(alpha: 0.0)],
              ),
            ),
            child: child,
          ),
        ),
      );
}

/// Wortmarke wie in der Kopfzeile von lx-labs.dev: „lx“ cyan, „-labs“ weiß, „.dev“ in Monospace gedämpft.
class LxWordmark extends StatelessWidget {
  final double size;
  const LxWordmark({super.key, this.size = 18});

  @override
  Widget build(BuildContext context) => Text.rich(
        TextSpan(children: [
          const TextSpan(text: 'lx', style: TextStyle(color: kAccent)),
          const TextSpan(text: '-labs', style: TextStyle(color: Colors.white)),
          TextSpan(
              text: '.dev',
              style: TextStyle(color: kTextMuted, fontFamily: kFontMono, fontWeight: FontWeight.w500, letterSpacing: 0, fontSize: size * 0.9)),
        ]),
        style: TextStyle(fontWeight: FontWeight.w800, fontSize: size, letterSpacing: -0.4),
      );
}
