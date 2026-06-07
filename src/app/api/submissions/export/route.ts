import { getServerToken } from "@/lib/serverAuth";
import { getSubmissions } from "@/lib/api";
import { toCsv } from "@/lib/csv";
import type { SubmissionsResponse } from "@/lib/types";

/**
 * GET /api/submissions/export — CSV of ALL rows matching the current filters
 * (B-2). Token from the cookie; uses a large limit so the export isn't paginated.
 */
export async function GET(req: Request) {
  const token = getServerToken();
  if (!token) return new Response("Unauthorized", { status: 401 });

  const sp = new URL(req.url).searchParams;
  const res = (await getSubmissions(token, {
    page: 1,
    limit: 100000,
    q: sp.get("q") || undefined,
    status: sp.get("status") || undefined,
    type: sp.get("type") || undefined,
    project: sp.get("project") || undefined,
    from: sp.get("from") || undefined,
    to: sp.get("to") || undefined,
    min: sp.get("min") || undefined,
    max: sp.get("max") || undefined,
    sort: sp.get("sort") || undefined,
    dir: sp.get("dir") || undefined,
    fy: sp.get("fy") || undefined,
  })) as SubmissionsResponse & { error?: string };

  if (res.error) return new Response("Error", { status: 502 });

  const headers = ["Date", "Name", "Email", "Vendor", "Description", "Amount", "Project", "CR #", "Status", "Type", "Source", "Row ID"];
  const rows = res.records.map((r) => [
    r.date, r.name, r.email, r.vendor, r.description, r.amount, r.project, r.crNumber, r.status, r.type, r.source, r.id,
  ]);
  const csv = toCsv(headers, rows);

  return new Response("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv;charset=utf-8;",
      "Content-Disposition": `attachment; filename="submissions-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
