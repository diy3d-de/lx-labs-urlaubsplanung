// Datenmodelle der Mobile-App; Felder wie im Server-Schema (prisma/schema.prisma).

class Person {
  final String id;
  final String name;
  final bool isStudent;
  final String color;
  final int order;
  final double vacationDays;
  final bool heiligabendHalf;
  final bool silvesterHalf;

  /// Server-rev der zuletzt synchronisierten Fassung (0 = noch nie synchronisiert).
  final int rev;

  const Person({
    required this.id,
    required this.name,
    this.isStudent = false,
    required this.color,
    this.order = 0,
    this.vacationDays = 30,
    this.heiligabendHalf = true,
    this.silvesterHalf = true,
    this.rev = 0,
  });

  Person copyWith({
    String? name,
    bool? isStudent,
    String? color,
    int? order,
    double? vacationDays,
    bool? heiligabendHalf,
    bool? silvesterHalf,
    int? rev,
  }) =>
      Person(
        id: id,
        name: name ?? this.name,
        isStudent: isStudent ?? this.isStudent,
        color: color ?? this.color,
        order: order ?? this.order,
        vacationDays: vacationDays ?? this.vacationDays,
        heiligabendHalf: heiligabendHalf ?? this.heiligabendHalf,
        silvesterHalf: silvesterHalf ?? this.silvesterHalf,
        rev: rev ?? this.rev,
      );

  Map<String, Object?> toSyncJson() => {
        'id': id,
        'name': name,
        'isStudent': isStudent,
        'color': color,
        'order': order,
        'vacationDays': vacationDays,
        'heiligabendHalf': heiligabendHalf,
        'silvesterHalf': silvesterHalf,
        'baseRev': rev,
      };

  factory Person.fromSyncJson(Map<String, dynamic> j) => Person(
        id: j['id'] as String,
        name: j['name'] as String,
        isStudent: j['isStudent'] as bool,
        color: j['color'] as String,
        order: (j['order'] as num).toInt(),
        vacationDays: (j['vacationDays'] as num).toDouble(),
        heiligabendHalf: j['heiligabendHalf'] as bool,
        silvesterHalf: j['silvesterHalf'] as bool,
        rev: (j['rev'] as num).toInt(),
      );
}

class Vacation {
  final String id;
  final String personId;

  /// Kalendertage im Format YYYY-MM-DD
  final String startDate;
  final String endDate;

  /// Nur bei Einzeltagen: halber Urlaubstag
  final bool halfDay;
  final String? note;
  final int rev;

  const Vacation({
    required this.id,
    required this.personId,
    required this.startDate,
    required this.endDate,
    this.halfDay = false,
    this.note,
    this.rev = 0,
  });

  bool get isSingleDay => startDate == endDate;

  Vacation copyWith({String? personId, String? startDate, String? endDate, bool? halfDay, String? note, int? rev}) =>
      Vacation(
        id: id,
        personId: personId ?? this.personId,
        startDate: startDate ?? this.startDate,
        endDate: endDate ?? this.endDate,
        halfDay: halfDay ?? this.halfDay,
        note: note ?? this.note,
        rev: rev ?? this.rev,
      );

  Map<String, Object?> toSyncJson() => {
        'id': id,
        'personId': personId,
        'startDate': startDate,
        'endDate': endDate,
        'halfDay': halfDay,
        'note': note,
        'baseRev': rev,
      };

  factory Vacation.fromSyncJson(Map<String, dynamic> j) => Vacation(
        id: j['id'] as String,
        personId: j['personId'] as String,
        startDate: j['startDate'] as String,
        endDate: j['endDate'] as String,
        halfDay: j['halfDay'] as bool,
        note: j['note'] as String?,
        rev: (j['rev'] as num).toInt(),
      );
}

class PublicHoliday {
  final String date;
  final String name;
  const PublicHoliday(this.date, this.name);
}

class SchoolHoliday {
  final String name;
  final String start;
  final String end;
  const SchoolHoliday(this.name, this.start, this.end);
}
