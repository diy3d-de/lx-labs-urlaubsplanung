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
      surface: kSurface,
      onSurface: kText,
      error: kDanger,
    );
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
          scaffoldBackgroundColor: kBg,
          useMaterial3: true,
          appBarTheme: const AppBarTheme(backgroundColor: kBg, foregroundColor: kText, elevation: 0),
          cardTheme: const CardThemeData(color: kSurface, margin: EdgeInsets.zero),
          dividerColor: kBorder,
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
      body: SafeArea(child: IndexedStack(index: _tab, children: screens)),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        backgroundColor: kSurface,
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
