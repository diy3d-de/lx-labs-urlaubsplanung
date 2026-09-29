import { BUNDESLAENDER, type BundeslandCode } from "./bundeslaender";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Als Codepoints statt Regex: die Zeichen sind unsichtbar, U+2028/U+2029 beenden sogar Regex-Literale.
// Tab, LF, CR, NEL (U+0085), Zeilen-/Absatztrenner (U+2028/U+2029)
const LINE_BREAKS = new Set([0x09, 0x0a, 0x0d, 0x85, 0x2028, 0x2029]);
// Bidi-Steuerzeichen (LRM/RLM, Embeddings/Overrides, Isolates) – ermöglichen Namens-Spoofing
const BIDI = new Set([0x200e, 0x200f, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069]);

export class ValidationError extends Error {}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Request-Body als Objekt; Arrays, null und Primitive werden zu {}. */
export function asObject(value: unknown): Record<string, unknown> {
  return isObject(value) ? value : {};
}

/** Zeilenumbrüche/Tabs werden zu Leerzeichen, Steuer- (C0/C1) und Bidi-Zeichen entfallen, dann trim. */
export function sanitizeText(value: string): string {
  let out = "";
  for (const ch of value) {
    const cp = ch.codePointAt(0)!;
    if (LINE_BREAKS.has(cp)) out += " ";
    else if (cp >= 0x20 && (cp < 0x7f || cp > 0x9f) && !BIDI.has(cp)) out += ch;
  }
  return out.trim();
}

export function assertDateString(value: unknown, field: string): string {
  // Rückwandlung lehnt Tage wie 2026-02-30 ab; ab 1900 fallen Tippfehler wie „0202“ auf
  if (
    typeof value !== "string" ||
    !DATE_RE.test(value) ||
    value < "1900-01-01" ||
    Number.isNaN(Date.parse(value)) ||
    new Date(value).toISOString().slice(0, 10) !== value
  ) {
    throw new ValidationError(`${field} muss ein gültiges Datum (YYYY-MM-DD) sein`);
  }
  return value;
}

export function assertDateRange(start: string, end: string) {
  if (end < start) {
    throw new ValidationError("Enddatum darf nicht vor dem Startdatum liegen");
  }
}

export function assertName(value: unknown): string {
  const trimmed = typeof value === "string" ? sanitizeText(value) : "";
  if (trimmed.length === 0) {
    throw new ValidationError("Name darf nicht leer sein");
  }
  if (trimmed.length > 80) {
    throw new ValidationError("Name darf höchstens 80 Zeichen lang sein");
  }
  return trimmed;
}

export function assertNote(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new ValidationError("Notiz muss Text sein");
  const trimmed = sanitizeText(value);
  if (trimmed.length > 200) throw new ValidationError("Notiz darf höchstens 200 Zeichen lang sein");
  return trimmed || null;
}

export function assertBundesland(value: unknown): BundeslandCode {
  if (typeof value !== "string" || !BUNDESLAENDER.some((b) => b.code === value)) {
    throw new ValidationError("Unbekanntes Bundesland");
  }
  return value as BundeslandCode;
}

export function assertColor(value: unknown): string {
  if (typeof value !== "string" || !/^(#[0-9a-fA-F]{6}|var\(--p\d\))$/.test(value)) {
    throw new ValidationError("Ungültige Farbe");
  }
  return value;
}

export function assertVacationDays(value: unknown): number {
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || Number.isNaN(n) || n < 0 || n > 365 || Math.round(n * 2) !== n * 2) {
    throw new ValidationError("Urlaubsanspruch muss zwischen 0 und 365 liegen (halbe Tage erlaubt)");
  }
  return n;
}

export function assertBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw new ValidationError(`${field} muss ein Wahrheitswert sein`);
  }
  return value;
}
