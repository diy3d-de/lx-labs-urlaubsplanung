import { formatLocalDate, parseLocalDate } from "./dateRange";
import type { Person, Vacation } from "./types";

/** true, wenn dieser Tag innerhalb des Eintrags nur als halber Urlaubstag zählt. */
export function isHalfDay(
  vacation: Pick<Vacation, "startDate" | "endDate" | "halfDay">,
  person: Pick<Person, "heiligabendHalf" | "silvesterHalf">,
  day: Date
): boolean {
  const isSingleDay = vacation.startDate === vacation.endDate;
  if (isSingleDay && vacation.halfDay) return true;
  if (isSingleDay) return false;
  const isHeiligabend = day.getMonth() === 11 && day.getDate() === 24;
  const isSilvester = day.getMonth() === 11 && day.getDate() === 31;
  return (isHeiligabend && person.heiligabendHalf) || (isSilvester && person.silvesterHalf);
}

/**
 * Zählt die tatsächlich angerechneten Urlaubstage eines Eintrags:
 * Wochenenden und gesetzliche Feiertage zählen nicht. Bei Einzeltagen kann
 * ein halber Tag gewählt werden; 24.12./31.12. zählen sonst je nach
 * Personen-Einstellung als halber oder ganzer Tag.
 */
export function countVacationDays(
  vacation: Pick<Vacation, "startDate" | "endDate" | "halfDay">,
  person: Pick<Person, "heiligabendHalf" | "silvesterHalf">,
  holidayDates: Set<string>
): number {
  const start = parseLocalDate(vacation.startDate);
  const end = parseLocalDate(vacation.endDate);
  const isSingleDay = vacation.startDate === vacation.endDate;
  let total = 0;
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const weekday = d.getDay();
    if (weekday === 0 || weekday === 6) continue;
    const key = formatLocalDate(d);
    if (holidayDates.has(key)) continue;

    if (isSingleDay && vacation.halfDay) total += 0.5;
    else if (isHalfDay(vacation, person, d)) total += 0.5;
    else total += 1;
  }
  return total;
}

export function isCountableVacationDay(date: Date, holidayDates: Set<string>): boolean {
  const weekday = date.getDay();
  if (weekday === 0 || weekday === 6) return false;
  return !holidayDates.has(formatLocalDate(date));
}
