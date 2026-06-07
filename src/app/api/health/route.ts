import { NextResponse } from "next/server";
import { getHealth } from "@/lib/api";

/** GET /api/health — proxies the Apps Script health check (C4) for the client banner. */
export async function GET() {
  try {
    const health = await getHealth();
    return NextResponse.json(health, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ status: "down" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
