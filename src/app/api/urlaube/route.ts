import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readJson } from "@/lib/http";
import { asObject, assertDateRange, assertDateString, assertNote, ValidationError } from "@/lib/validate";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const urlaube = await prisma.vacation.findMany({
    where:
      from && to
        ? {
            startDate: { lte: to },
            endDate: { gte: from },
          }
        : undefined,
    include: { person: true },
    orderBy: { startDate: "asc" },
  });
  return NextResponse.json(urlaube);
}

export async function POST(req: NextRequest) {
  const json = await readJson(req);
  if (!json.ok) return json.response;
  const body = asObject(json.body);
  try {
    const startDate = assertDateString(body.startDate, "Startdatum");
    const endDate = assertDateString(body.endDate, "Enddatum");
    assertDateRange(startDate, endDate);
    const note = assertNote(body.note);
    const halfDay = startDate === endDate ? !!body.halfDay : false;

    if (typeof body.personId !== "string" || !body.personId) {
      return NextResponse.json({ error: "personId fehlt" }, { status: 400 });
    }
    const person = await prisma.person.findUnique({ where: { id: body.personId } });
    if (!person) {
      return NextResponse.json({ error: "Person nicht gefunden" }, { status: 404 });
    }

    const urlaub = await prisma.vacation.create({
      data: { personId: body.personId, startDate, endDate, halfDay, note },
      include: { person: true },
    });
    return NextResponse.json(urlaub, { status: 201 });
  } catch (err) {
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
