import { NextRequest, NextResponse } from "next/server";
import { fetchPublicHolidays, fetchSchoolHolidays } from "@/lib/holidays";
import { BUNDESLAENDER } from "@/lib/bundeslaender";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const year = parseInt(searchParams.get("year") ?? "", 10);
  const bundesland = searchParams.get("bundesland") ?? "BW";

  if (!year || Number.isNaN(year) || year < 2000 || year > 2100) {
    return NextResponse.json({ error: "Ungültiges Jahr" }, { status: 400 });
  }
  if (!BUNDESLAENDER.some((b) => b.code === bundesland)) {
    return NextResponse.json({ error: "Unbekanntes Bundesland" }, { status: 400 });
  }

  let ferienFailed = false;
  try {
    const [feiertage, ferien] = await Promise.all([
      fetchPublicHolidays(year, bundesland),
      fetchSchoolHolidays(year, bundesland).catch(() => {
        ferienFailed = true;
        return [];
      }),
    ]);
    return NextResponse.json({ feiertage, ferien, ferienFailed });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unbekannter Fehler" },
      { status: 502 }
    );
  }
}
