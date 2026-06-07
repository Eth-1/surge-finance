import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { postAuthCheck } from "@/lib/appsScript";

/**
 * POST /api/auth  — password handshake (§1.6 / S2).
 * Body: { password }. On success, stores the signed HMAC token in the
 * `surge-auth` cookie (Max-Age = token expiry) and returns { ok }. The cookie
 * provides X5's "no re-entry for 7 days, across tab closes" persistence AND is
 * readable by Server Components (which localStorage is not). The plaintext
 * password is sent exactly once, here, and never reflected back.
 */
export async function POST(req: Request) {
  let password = "";
  try {
    const body = await req.json();
    password = String(body?.password || "");
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const result = await postAuthCheck(password);
  if (result.ok && result.token) {
    const days = result.expiresInDays || 7;
    cookies().set("surge-auth", result.token, {
      maxAge: days * 86400,
      path: "/",
      sameSite: "lax",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
    });
    return NextResponse.json({ ok: true, expiresInDays: days });
  }
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

/** DELETE /api/auth — sign out (clear the cookie). */
export async function DELETE() {
  cookies().set("surge-auth", "", { maxAge: 0, path: "/" });
  return NextResponse.json({ ok: true });
}
