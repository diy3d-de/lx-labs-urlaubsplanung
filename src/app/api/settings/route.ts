import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readJson } from "@/lib/http";
import { asObject, assertBundesland, ValidationError } from "@/lib/validate";

export async function GET() {
  const settings = await prisma.settings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });
  return NextResponse.json(settings);
}

export async function PATCH(req: NextRequest) {
  const json = await readJson(req);
  if (!json.ok) return json.response;
  const body = asObject(json.body);
  try {
    const bundesland = assertBundesland(body.bundesland);
    const settings = await prisma.settings.upsert({
      where: { id: 1 },
      update: { bundesland },
      create: { id: 1, bundesland },
    });
    return NextResponse.json(settings);
  } catch (err) {
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
