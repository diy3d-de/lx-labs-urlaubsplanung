// iCalendar-Export (RFC 5545) für Outlook, Google und Apple Kalender

export interface IcsEvent {
  uid: string;
  start: string; // yyyy-MM-dd
  end: string; // yyyy-MM-dd, inklusive
  summary: string;
}

// iCalendar kennt nur 4-stellige Jahre (DATE = JJJJMMTT)
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

// LF, CR, NEL (U+0085), Zeilen-/Absatztrenner (U+2028/U+2029) – als Codepoints, da unsichtbar
const LINE_BREAKS = new Set([0x0a, 0x0d, 0x85, 0x2028, 0x2029]);

/**
 * TEXT-Werte escapen (RFC 5545, 3.3.11). Zeilenumbrüche – auch Unicode-Zeilentrenner, an denen manche
 * Parser trennen – werden zu \n, andere Steuerzeichen entfallen: kein Einschleusen von Properties.
 */
function escapeText(value: string): string {
  let out = "";
  for (const ch of value.replace(/\r\n/g, "\n")) {
    const cp = ch.codePointAt(0)!;
    if (ch === "\\" || ch === ";" || ch === ",") out += `\\${ch}`;
    else if (LINE_BREAKS.has(cp)) out += "\\n";
    else if ((cp >= 0x20 && cp !== 0x7f) || cp === 0x09) out += ch;
  }
  return out;
}

/** Zeilen auf max. 75 Bytes falten (RFC 5545, 3.1), ohne UTF-8-Zeichen zu zerteilen. */
function fold(line: string): string {
  const parts: string[] = [];
  let current = "";
  let bytes = 0;
  for (const ch of line) {
    const cp = ch.codePointAt(0)!;
    const size = cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
    // Folgezeilen beginnen mit einem Leerzeichen, das mitzählt
    if (bytes + size > (parts.length === 0 ? 75 : 74)) {
      parts.push(current);
      current = "";
      bytes = 0;
    }
    current += ch;
    bytes += size;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

function nextDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().split("T")[0];
}

const compact = (day: string) => day.replace(/-/g, "");

/**
 * Ganztägige, als „frei“ markierte Termine – blockieren den Kalender des Importierenden nicht.
 * count = Zahl der exportierten Termine; bei 0 ist die Datei nach RFC 5545 ungültig.
 */
export function buildIcs(
  events: IcsEvent[],
  calendarName: string,
  now = new Date()
): { ics: string; count: number } {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//lx-urlaubsplanung//Urlaubsplanung//DE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(calendarName)}`,
  ];
  let count = 0;

  for (const e of events) {
    if (!DAY_RE.test(e.start) || !DAY_RE.test(e.end)) continue;
    // DTEND ist bei ganztägigen Terminen exklusiv
    const end = nextDay(e.end);
    if (!DAY_RE.test(end)) continue;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${escapeText(e.uid)}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${compact(e.start)}`,
      `DTEND;VALUE=DATE:${compact(end)}`,
      `SUMMARY:${escapeText(e.summary)}`,
      "TRANSP:TRANSPARENT",
      "END:VEVENT"
    );
    count++;
  }

  lines.push("END:VCALENDAR");
  return { ics: lines.map(fold).join("\r\n") + "\r\n", count };
}
