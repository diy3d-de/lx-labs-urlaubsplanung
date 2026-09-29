import {
  addMonths,
  addQuarters,
  endOfMonth,
  endOfQuarter,
  endOfYear,
  format,
  getDaysInMonth,
  isSameMonth,
  startOfMonth,
  startOfQuarter,
  startOfYear,
} from "date-fns";
import { de } from "date-fns/locale";
import type { ViewMode } from "./types";

/** Parst "YYYY-MM-DD" als lokalen Kalendertag (keine UTC-Verschiebung). */
export function parseLocalDate(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function formatLocalDate(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

export function getRange(viewMode: ViewMode, anchor: Date): { start: Date; end: Date } {
  switch (viewMode) {
    case "month":
      return { start: startOfMonth(anchor), end: endOfMonth(anchor) };
    case "quarter":
      return { start: startOfQuarter(anchor), end: endOfQuarter(anchor) };
    case "halfyear": {
      const half = anchor.getMonth() < 6 ? 0 : 6;
      const start = new Date(anchor.getFullYear(), half, 1);
      const end = endOfMonth(new Date(anchor.getFullYear(), half + 5, 1));
      return { start, end };
    }
    case "year":
      return { start: startOfYear(anchor), end: endOfYear(anchor) };
  }
}

export function shiftAnchor(viewMode: ViewMode, anchor: Date, dir: 1 | -1): Date {
  switch (viewMode) {
    case "month":
      return addMonths(anchor, dir);
    case "quarter":
      return addQuarters(anchor, dir);
    case "halfyear":
      return addMonths(anchor, dir * 6);
    case "year":
      return new Date(anchor.getFullYear() + dir, anchor.getMonth(), 1);
  }
}

/** Erster Tag jedes Monats, der im Bereich [start, end] liegt. */
export function monthsInRange(start: Date, end: Date): Date[] {
  const months: Date[] = [];
  let cur = startOfMonth(start);
  const last = startOfMonth(end);
  while (cur <= last) {
    months.push(cur);
    cur = addMonths(cur, 1);
  }
  return months;
}

export function daysOfMonth(monthStart: Date): Date[] {
  const count = getDaysInMonth(monthStart);
  return Array.from({ length: count }, (_, i) => new Date(monthStart.getFullYear(), monthStart.getMonth(), i + 1));
}

export function rangeLabel(viewMode: ViewMode, anchor: Date): string {
  const { start, end } = getRange(viewMode, anchor);
  switch (viewMode) {
    case "month":
      return format(anchor, "MMMM yyyy", { locale: de });
    case "quarter":
      return `Q${Math.floor(anchor.getMonth() / 3) + 1} ${anchor.getFullYear()}`;
    case "halfyear":
      return `${anchor.getMonth() < 6 ? "1." : "2."} Halbjahr ${anchor.getFullYear()}`;
    case "year":
      return `${anchor.getFullYear()}`;
    default:
      return `${format(start, "d.M.yyyy")} – ${format(end, "d.M.yyyy")}`;
  }
}

export { isSameMonth, format };
