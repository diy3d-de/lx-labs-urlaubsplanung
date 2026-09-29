import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readJson, rejectCrossSite } from "@/lib/http";
import { asObject, assertColor, assertName, assertVacationDays, ValidationError } from "@/lib/validate";
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
    const name = body.name !== undefined ? assertName(body.name) : undefined;
    const color = body.color !== undefined ? assertColor(body.color) : undefined;
    const isStudent = body.isStudent !== undefined ? !!body.isStudent : undefined;
    const vacationDays = body.vacationDays !== undefined ? assertVacationDays(body.vacationDays) : undefined;
    const heiligabendHalf = body.heiligabendHalf !== undefined ? !!body.heiligabendHalf : undefined;
    const silvesterHalf = body.silvesterHalf !== undefined ? !!body.silvesterHalf : undefined;

    const person = await prisma.person.update({
      where: { id },
      data: { name, isStudent, color, vacationDays, heiligabendHalf, silvesterHalf },
    });
    return NextResponse.json(person);
  } catch (err) {
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return NextResponse.json({ error: "Person nicht gefunden" }, { status: 404 });
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
    await prisma.person.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return NextResponse.json({ error: "Person nicht gefunden" }, { status: 404 });
    }
    throw err;
  }
}
