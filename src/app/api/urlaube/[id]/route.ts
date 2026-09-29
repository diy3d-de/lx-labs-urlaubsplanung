import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readJson, rejectCrossSite } from "@/lib/http";
import { asObject, assertDateRange, assertDateString, assertNote, ValidationError } from "@/lib/validate";
import { Prisma } from "@prisma/client";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const json = await readJson(req);
  if (!json.ok) return json.response;
  const body = asObject(json.body);
  try {
    const startDate = body.startDate !== undefined ? assertDateString(body.startDate, "Startdatum") : undefined;
    const endDate = body.endDate !== undefined ? assertDateString(body.endDate, "Enddatum") : undefined;
    if (startDate && endDate) assertDateRange(startDate, endDate);
    const note = body.note !== undefined ? assertNote(body.note) : undefined;
    const halfDay = body.halfDay !== undefined ? !!body.halfDay : undefined;

    let personId: string | undefined;
    if (body.personId !== undefined) {
      if (typeof body.personId !== "string" || !body.personId) {
        return NextResponse.json({ error: "personId ungültig" }, { status: 400 });
      }
      const person = await prisma.person.findUnique({ where: { id: body.personId } });
      if (!person) {
        return NextResponse.json({ error: "Person nicht gefunden" }, { status: 404 });
      }
      personId = body.personId;
    }

    const urlaub = await prisma.vacation.update({
      where: { id },
      data: { startDate, endDate, note, personId, halfDay },
      include: { person: true },
    });
    return NextResponse.json(urlaub);
  } catch (err) {
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return NextResponse.json({ error: "Urlaub nicht gefunden" }, { status: 404 });
    }
    throw err;
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const blocked = rejectCrossSite(req);
  if (blocked) return blocked;
  const { id } = await params;
  try {
    await prisma.vacation.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return NextResponse.json({ error: "Urlaub nicht gefunden" }, { status: 404 });
    }
    throw err;
  }
}
