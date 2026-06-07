import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Edge middleware (§6.2, §6.6 / S1):
 *  - Redirects "/" → "/status".
 *  - Rate-limits public /status LOOKUPS (requests carrying ?email= or ?id=) to a
 *    burst of 10 / minute / IP via a free in-memory fixed-window counter. This is
 *    per edge-region (sufficient for the enumeration/DoS threat model — no paid KV).
 *
 * Password gating for /dashboard, /reports, /submissions, /year-end is handled
 * client-side via the localStorage token (AuthGate, task 4.7) — the token lives
 * in the browser and is forwarded server-side, so it isn't checkable here.
 */

const WINDOW_MS = 60_000;
const BURST = 10; // §6.6: 5 req/min steady, burst 10

const hits = new Map<string, { bucket: number; count: number }>();

function rateLimited(ip: string): boolean {
  const bucket = Math.floor(Date.now() / WINDOW_MS);
  const rec = hits.get(ip);
  if (!rec || rec.bucket !== bucket) {
    hits.set(ip, { bucket, count: 1 });
    return false;
  }
  rec.count += 1;
  return rec.count > BURST;
}

export function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;

  if (pathname === "/") {
    return NextResponse.redirect(new URL("/status", req.url));
  }

  if (pathname === "/status" && (searchParams.has("email") || searchParams.has("id"))) {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";
    if (rateLimited(ip)) {
      return new NextResponse("Too many lookups — please wait a minute.", {
        status: 429,
        headers: { "Retry-After": "60", "Content-Type": "text/plain" },
      });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/status"],
};
