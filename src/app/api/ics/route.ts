import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError } from "@/lib/http";
import { buildIcs } from "@/lib/ics";

// Export aller Urlaube als iCalendar-Datei (ganztägige Termine) zum Import in Kalender-Apps
export async function GET() {
  const urlaube = await prisma.vacation.findMany({
    include: { person: true },
    orderBy: { startDate: "asc" },
  });

  const { ics, count } = buildIcs(
    urlaube.map((v) => ({
      // UID = Datenbank-ID: bleibt bei Änderungen gleich, damit Kalender-Apps den Termin wiedererkennen.
      // Nach „Backup ersetzen“ entstehen neue IDs – ein erneuter Import legt die Termine dann neu an.
      uid: `${v.id}@lx-urlaubsplanung`,
      start: v.startDate,
      end: v.endDate,
      summary: `Urlaub ${v.person.name}${v.halfDay ? " (halber Tag)" : ""}${v.note ? ` – ${v.note}` : ""}`,
    })),
    "Urlaubsplanung"
  );
  if (count === 0) return jsonError("Keine Urlaube zum Exportieren", 404);

  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="urlaubsplanung-${new Date().toISOString().slice(0, 10)}.ics"`,
      "Cache-Control": "no-store",
    },
  });
}
