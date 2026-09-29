import { NextRequest, NextResponse } from "next/server";

// Obergrenze für normale JSON-Anfragen (Person, Urlaub, Einstellungen)
const MAX_JSON_BYTES = 64_000;

export function jsonError(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

/**
 * Zusatzschutz gegen CSRF (Fetch Metadata): Browser kennzeichnen Anfragen fremder Seiten mit
 * Sec-Fetch-Site "cross-site"/"same-site" – allerdings nur bei HTTPS oder localhost. Der eigentliche
 * Schutz ist readJson (nur application/json) bzw. bei DELETE der CORS-Preflight.
 */
export function rejectCrossSite(req: NextRequest): NextResponse | null {
  const site = req.headers.get("sec-fetch-site");
  return site && site !== "same-origin" && site !== "none"
    ? jsonError("Anfrage von fremder Seite abgelehnt", 403)
    : null;
}

/** Liest den Body mit Byte-Limit – auch bei chunked Requests ohne Content-Length. null = zu groß. */
async function readBody(req: NextRequest, limit: number): Promise<string | null> {
  if (Number(req.headers.get("content-length")) > limit) return null;
  if (!req.body) return "";
  const reader = req.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return text + decoder.decode();
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return null;
    }
    text += decoder.decode(value, { stream: true });
  }
}

type JsonBody = { ok: true; body: unknown } | { ok: false; response: NextResponse };

/** JSON-Body für schreibende Routen: CSRF-Schutz, nur application/json, Größenlimit. */
export async function readJson(req: NextRequest, limit = MAX_JSON_BYTES): Promise<JsonBody> {
  const blocked = rejectCrossSite(req);
  if (blocked) return { ok: false, response: blocked };
  // Formulare fremder Seiten können kein application/json senden; fetch damit erzwingt einen CORS-Preflight
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return { ok: false, response: jsonError("Ungültiger Content-Type", 415) };
  }
  const text = await readBody(req, limit);
  if (text === null) return { ok: false, response: jsonError("Anfrage ist zu groß", 413) };
  try {
    return { ok: true, body: JSON.parse(text) };
  } catch {
    return { ok: false, response: jsonError("Ungültiges JSON") };
  }
}
