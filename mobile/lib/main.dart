import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/date_symbol_data_local.dart';

import 'app_state.dart';
import 'constants.dart';
import 'local_db.dart';
import 'screens/balance_screen.dart';
import 'screens/calendar_screen.dart';
import 'screens/persons_screen.dart';
import 'screens/settings_screen.dart';
import 'update_service.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await initializeDateFormatting('de_DE');
  final state = AppState(await LocalDb.open());
  await state.init();
  runApp(UrlaubsplanungApp(state: state, updates: UpdateService()));
}

class UrlaubsplanungApp extends StatelessWidget {
  final AppState state;
  final UpdateService updates;
  const UrlaubsplanungApp({super.key, required this.state, required this.updates});

  @override
  Widget build(BuildContext context) {
    final scheme = ColorScheme.fromSeed(seedColor: kAccent, brightness: Brightness.dark).copyWith(
      primary: kAccent,
      onPrimary: kOnAccent,
      secondary: kNeural,
      surface: kSurface,
      onSurface: kText,
      onSurfaceVariant: kTextMuted,
      outline: kBorder,
      outlineVariant: kBorder,
      error: kDanger,
    );
    const radius = BorderRadius.all(Radius.circular(12));
    final base = ThemeData(brightness: Brightness.dark, useMaterial3: true);
    final textTheme = base.textTheme.apply(fontFamily: kFontSans, bodyColor: kText, displayColor: kText);
    return AppScope(
      state: state,
      child: MaterialApp(
        title: 'lx-urlaubsplanung',
        debugShowCheckedModeBanner: false,
        locale: const Locale('de', 'DE'),
        supportedLocales: const [Locale('de', 'DE')],
        localizationsDelegates: const [
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        theme: ThemeData(
          colorScheme: scheme,
          useMaterial3: true,
          fontFamily: kFontSans,
          textTheme: textTheme,
          // transparent: den violett-cyanen Schimmer zeichnet HomeShell hinter alle Seiten
          scaffoldBackgroundColor: Colors.transparent,
          canvasColor: kBg,
          appBarTheme: AppBarTheme(
            backgroundColor: Colors.transparent,
            foregroundColor: kText,
            elevation: 0,
            scrolledUnderElevation: 0,
            titleTextStyle: textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800, letterSpacing: -0.4, color: Colors.white),
          ),
          cardTheme: const CardThemeData(
            color: kSurface,
            margin: EdgeInsets.zero,
            elevation: 0,
            shape: RoundedRectangleBorder(borderRadius: radius, side: BorderSide(color: kBorder)),
          ),
          dividerColor: kBorder,
          navigationBarTheme: NavigationBarThemeData(
            backgroundColor: kSurface,
            indicatorColor: kAccent.withValues(alpha: 0.14),
            iconTheme: WidgetStateProperty.resolveWith((s) => IconThemeData(color: s.contains(WidgetState.selected) ? kAccent : kTextMuted)),
            labelTextStyle: WidgetStateProperty.resolveWith((s) => TextStyle(
                  fontFamily: kFontMono,
                  fontSize: 11,
                  fontWeight: FontWeight.w500,
                  color: s.contains(WidgetState.selected) ? kAccent : kTextMuted,
                )),
          ),
          filledButtonTheme: FilledButtonThemeData(
            style: FilledButton.styleFrom(
              backgroundColor: kAccent,
              foregroundColor: kOnAccent,
              textStyle: const TextStyle(fontWeight: FontWeight.w600),
              shape: const RoundedRectangleBorder(borderRadius: radius),
            ),
          ),
          outlinedButtonTheme: OutlinedButtonThemeData(
            style: OutlinedButton.styleFrom(
              foregroundColor: kText,
              side: const BorderSide(color: kBorder),
              shape: const RoundedRectangleBorder(borderRadius: radius),
            ),
          ),
          textButtonTheme: TextButtonThemeData(style: TextButton.styleFrom(foregroundColor: kAccent)),
          floatingActionButtonTheme: const FloatingActionButtonThemeData(
            backgroundColor: kAccent,
            foregroundColor: kOnAccent,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.all(Radius.circular(16))),
          ),
          inputDecorationTheme: const InputDecorationTheme(
            enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: kBorder)),
            focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: kAccent, width: 2)),
            labelStyle: TextStyle(color: kTextMuted),
          ),
          switchTheme: SwitchThemeData(
            thumbColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? kOnAccent : kTextMuted),
            trackColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? kAccent : kSurface2),
            trackOutlineColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? kAccent : kBorder),
          ),
          bottomSheetTheme: const BottomSheetThemeData(
            backgroundColor: kSurface,
            surfaceTintColor: Colors.transparent,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
          ),
          dialogTheme: const DialogThemeData(
            backgroundColor: kSurface,
            surfaceTintColor: Colors.transparent,
            shape: RoundedRectangleBorder(borderRadius: radius, side: BorderSide(color: kBorder)),
          ),
          snackBarTheme: const SnackBarThemeData(backgroundColor: kSurface2, contentTextStyle: TextStyle(color: kText), behavior: SnackBarBehavior.floating),
          progressIndicatorTheme: const ProgressIndicatorThemeData(color: kAccent),
        ),
        home: HomeShell(updates: updates),
      ),
    );
  }
}

class HomeShell extends StatefulWidget {
  final UpdateService updates;
  const HomeShell({super.key, required this.updates});

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> with WidgetsBindingObserver {
  int _tab = 0;
  DateTime? _letztePruefung;
  Timer? _ersteUpdatePruefung;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    widget.updates.addListener(_onUpdate);
    widget.updates.init();
    // Wie die Desktop-App: erste Update-Prüfung kurz nach dem Start, danach beim Zurückkehren in die App
    _ersteUpdatePruefung = Timer(const Duration(seconds: 15), _updatePruefen);
    WidgetsBinding.instance.addPostFrameCallback((_) => AppScope.of(context).synchronisieren(still: true));
  }

  @override
  void dispose() {
    _ersteUpdatePruefung?.cancel();
    widget.updates.removeListener(_onUpdate);
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  void _onUpdate() => setState(() {});

  void _updatePruefen() {
    _letztePruefung = DateTime.now();
    widget.updates.pruefen();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState s) {
    if (s != AppLifecycleState.resumed) return;
    AppScope.of(context).synchronisieren(still: true);
    final l = _letztePruefung;
    if (l == null || DateTime.now().difference(l) > const Duration(hours: 6)) _updatePruefen();
  }

  @override
  Widget build(BuildContext context) {
    final updateDa = widget.updates.phase == UpdatePhase.verfuegbar || widget.updates.phase == UpdatePhase.bereit;
    final screens = [
      const CalendarScreen(),
      const BalanceScreen(),
      const PersonsScreen(),
      SettingsScreen(updates: widget.updates),
    ];
    return Scaffold(
      backgroundColor: kBg,
      body: LxBackground(child: SafeArea(child: IndexedStack(index: _tab, children: screens))),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (i) => setState(() => _tab = i),
        destinations: [
          const NavigationDestination(icon: Icon(Icons.calendar_month_outlined), selectedIcon: Icon(Icons.calendar_month), label: 'Kalender'),
          const NavigationDestination(icon: Icon(Icons.account_balance_wallet_outlined), selectedIcon: Icon(Icons.account_balance_wallet), label: 'Konto'),
          const NavigationDestination(icon: Icon(Icons.people_outline), selectedIcon: Icon(Icons.people), label: 'Personen'),
          NavigationDestination(
            icon: Badge(isLabelVisible: updateDa, child: const Icon(Icons.settings_outlined)),
            selectedIcon: Badge(isLabelVisible: updateDa, child: const Icon(Icons.settings)),
            label: 'Einstellungen',
          ),
        ],
      ),
    );
  }
}
