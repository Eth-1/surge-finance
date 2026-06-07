import { NextResponse } from "next/server";
import { getServerToken } from "@/lib/serverAuth";
import { getDashboard } from "@/lib/api";
import { dashboardChecksum } from "@/lib/checksum";
import type { DashboardData } from "@/lib/types";

/**
 * GET /api/dashboard-checksum — lightweight signature of current dashboard data
 * for the smart auto-refresh poller (§4.5f). Reads the token from the cookie
 * server-side; benefits from the dashboard ISR cache.
 */
export async function GET() {
  const token = getServerToken();
  if (!token) return NextResponse.json({ checksum: "" });
  try {
    const data = (await getDashboard(token)) as DashboardData & { error?: string };
    if (data.error) return NextResponse.json({ checksum: "" });
    return NextResponse.json({ checksum: dashboardChecksum(data) }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ checksum: "" }, { status: 503 });
  }
}
