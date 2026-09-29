import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PERSON_COLOR_VARS } from "@/lib/types";
import { jsonError, readJson } from "@/lib/http";
import { asObject, sanitizeText } from "@/lib/validate";
import {
  BACKUP_APP,
  BACKUP_VERSION,
  MAX_IMPORT_BYTES,
  parseBackup,
  type Backup,
  type ImportResult,
} from "@/lib/backup";

// Feste Reihenfolge (auch bei gleichem `order`), damit Export und Merge gleichnamige Personen gleich zuordnen
const PERSON_ORDER = [{ order: "asc" as const }, { createdAt: "asc" as const }];

// Export: alle Personen inkl. Urlaube + Einstellungen als JSON-Datei
export async function GET() {
  const [settings, personen] = await Promise.all([
    prisma.settings.findUnique({ where: { id: 1 } }),
    prisma.person.findMany({
      orderBy: PERSON_ORDER,
      include: { vacations: { orderBy: { startDate: "asc" } } },
    }),
  ]);

  const backup: Backup = {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    settings: { bundesland: settings?.bundesland ?? "BW" },
    personen: personen.map((p) => ({
      name: p.name,
      isStudent: p.isStudent,
      color: p.color,
      vacationDays: p.vacationDays,
      heiligabendHalf: p.heiligabendHalf,
      silvesterHalf: p.silvesterHalf,
      urlaube: p.vacations.map((v) => ({
        startDate: v.startDate,
        endDate: v.endDate,
        halfDay: v.halfDay,
        note: v.note || null,
      })),
    })),
  };

  return new NextResponse(JSON.stringify(backup, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="urlaubsplanung-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}

/** Merge: Farbe aus der Datei nur, wenn sie noch frei ist – sonst die erste freie Personenfarbe. */
function pickColor(preferred: string | null, used: Set<string>, order: number): string {
  const color =
    (preferred && !used.has(preferred) ? preferred : undefined) ??
    PERSON_COLOR_VARS.find((c) => !used.has(c)) ??
    PERSON_COLOR_VARS[order % PERSON_COLOR_VARS.length];
  used.add(color);
  return color;
}

// Import: { mode: "merge" | "replace", data: Backup }
export async function POST(req: NextRequest) {
  const json = await readJson(req, MAX_IMPORT_BYTES);
  if (!json.ok) return json.response;

  const { mode, data } = asObject(json.body);
  if (mode !== "merge" && mode !== "replace") return jsonError("Ungültiger Import-Modus");

  const parsed = parseBackup(data);
  if (!parsed.ok) return jsonError(parsed.error);
  const backup = parsed.data;

  try {
    const result = await prisma.$transaction(
      async (tx): Promise<ImportResult> => {
        const result: ImportResult = { personenNeu: 0, urlaubeNeu: 0, urlaubeUebersprungen: 0 };

        // Merge: Personen über den Namen zuordnen, bereits vorhandene Urlaube (gleicher Zeitraum) überspringen.
        // Bei gleichnamigen Personen gehört der n-te Eintrag der Datei zur n-ten Person in der DB.
        const byName = new Map<string, { id: string; days: Set<string> }[]>();
        const seen = new Map<string, number>();
        const usedColors = new Set<string>();
        let order = 0;

        if (mode === "replace") {
          await tx.vacation.deleteMany();
          await tx.person.deleteMany();
          await tx.settings.upsert({
            where: { id: 1 },
            update: { bundesland: backup.settings.bundesland },
            create: { id: 1, bundesland: backup.settings.bundesland },
          });
        } else {
          const existing = await tx.person.findMany({
            orderBy: PERSON_ORDER,
            select: {
              id: true,
              name: true,
              color: true,
              order: true,
              vacations: { select: { startDate: true, endDate: true } },
            },
          });
          for (const p of existing) {
            order = Math.max(order, p.order + 1);
            usedColors.add(p.color);
            // gleiche Bereinigung wie beim Parsen der Datei
            const key = sanitizeText(p.name).toLowerCase();
            const days = new Set<string>(p.vacations.map((v) => `${v.startDate}|${v.endDate}`));
            byName.set(key, [...(byName.get(key) ?? []), { id: p.id, days }]);
          }
        }

        for (const p of backup.personen) {
          const key = p.name.toLowerCase();
          const n = seen.get(key) ?? 0;
          seen.set(key, n + 1);
          let target = byName.get(key)?.[n];

          if (!target) {
            const created = await tx.person.create({
              data: {
                name: p.name,
                isStudent: p.isStudent,
                color:
                  mode === "replace"
                    ? p.color ?? PERSON_COLOR_VARS[order % PERSON_COLOR_VARS.length]
                    : pickColor(p.color, usedColors, order),
                vacationDays: p.vacationDays,
                heiligabendHalf: p.heiligabendHalf,
                silvesterHalf: p.silvesterHalf,
                order: order++,
              },
            });
            target = { id: created.id, days: new Set<string>() };
            result.personenNeu++;
          }
          const { id: personId, days } = target;

          const neu = p.urlaube.filter((v) => {
            if (mode === "replace") return true;
            const k = `${v.startDate}|${v.endDate}`;
            if (days.has(k)) return false;
            days.add(k);
            return true;
          });
          result.urlaubeUebersprungen += p.urlaube.length - neu.length;

          if (neu.length > 0) {
            await tx.vacation.createMany({
              data: neu.map((v) => ({
                personId,
                startDate: v.startDate,
                endDate: v.endDate,
                halfDay: v.halfDay,
                note: v.note,
              })),
            });
            result.urlaubeNeu += neu.length;
          }
        }

        return result;
      },
      { timeout: 30_000 }
    );
    return NextResponse.json(result);
  } catch (err) {
    console.error("Import fehlgeschlagen", err);
    return jsonError("Import fehlgeschlagen", 500);
  }
}
