import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readJson } from "@/lib/http";
import { asObject, assertColor, assertName, assertVacationDays, ValidationError } from "@/lib/validate";

export async function GET() {
  const personen = await prisma.person.findMany({ orderBy: { order: "asc" } });
  return NextResponse.json(personen);
}

export async function POST(req: NextRequest) {
  const json = await readJson(req);
  if (!json.ok) return json.response;
  const body = asObject(json.body);
  try {
    const name = assertName(body.name);
    const color = assertColor(body.color ?? "#6366f1");
    const vacationDays = assertVacationDays(body.vacationDays ?? 30);

    const agg = await prisma.person.aggregate({ _max: { order: true } });
    const person = await prisma.person.create({
      data: {
        name,
        isStudent: !!body.isStudent,
        color,
        vacationDays,
        heiligabendHalf: body.heiligabendHalf === undefined ? true : !!body.heiligabendHalf,
        silvesterHalf: body.silvesterHalf === undefined ? true : !!body.silvesterHalf,
        order: (agg._max.order ?? -1) + 1,
      },
    });
    return NextResponse.json(person, { status: 201 });
  } catch (err) {
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
