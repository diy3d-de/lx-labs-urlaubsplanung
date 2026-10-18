import { NextRequest, NextResponse } from "next/server";
import { jsonError, readJson } from "@/lib/http";
import { ValidationError } from "@/lib/validate";
import { MAX_SYNC_BYTES, parseSyncRequest } from "@/lib/sync";
import { applySync, SyncBusyError } from "@/lib/syncDb";

// Abgleich mit der Mobile-App, siehe src/lib/sync.ts
export async function POST(req: NextRequest) {
  const json = await readJson(req, MAX_SYNC_BYTES);
  if (!json.ok) return json.response;

  let body;
  try {
    body = parseSyncRequest(json.body);
  } catch (err) {
    if (err instanceof ValidationError) return jsonError(err.message);
    throw err;
  }

  try {
    return NextResponse.json(applySync(body), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof SyncBusyError) {
      return NextResponse.json({ error: err.message }, { status: 503, headers: { "Retry-After": "2" } });
    }
    console.error("Abgleich fehlgeschlagen", err);
    return jsonError("Abgleich fehlgeschlagen", 500);
  }
}
