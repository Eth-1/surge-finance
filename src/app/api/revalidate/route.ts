import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";

/**
 * POST /api/revalidate — on-edit revalidation webhook target (D1). Apps Script
 * posts { tag, secret } for significant changes; we validate the shared secret
 * (REVALIDATE_SECRET, mirrored from the Apps Script Script Property) and
 * invalidate the matching ISR tag so changes propagate within seconds.
 */
export async function POST(req: Request) {
  let body: { tag?: string; secret?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  if (!body.secret || body.secret !== process.env.REVALIDATE_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!body.tag) {
    return NextResponse.json({ error: "missing_tag" }, { status: 400 });
  }

  revalidateTag(String(body.tag));
  return NextResponse.json({ ok: true, revalidated: body.tag });
}
