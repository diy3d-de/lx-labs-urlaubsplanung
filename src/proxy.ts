import { NextResponse, type NextRequest } from "next/server";
import { isAllowedHost } from "@/lib/hosts";

// Schutz der API gegen DNS-Rebinding (siehe src/lib/hosts.ts)
export function proxy(request: NextRequest) {
  if (!isAllowedHost(request.headers.get("host"), process.env.ALLOWED_HOSTS)) {
    return NextResponse.json(
      { error: "Unbekannter Host - ggf. in ALLOWED_HOSTS eintragen" },
      { status: 421 }
    );
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
