#!/usr/bin/env node
/**
 * smoke.mjs — quick Web App connectivity smoke test (§5.3).
 * Usage: APPS_SCRIPT_WEB_APP_URL=https://.../exec node scripts/smoke.mjs
 *
 * Hits the public `health` and `status` endpoints (no token needed) and prints
 * the results. A 200 with { status: "ok" } confirms the deployment is reachable.
 */
const BASE = process.env.APPS_SCRIPT_WEB_APP_URL;
if (!BASE) {
  console.error("Set APPS_SCRIPT_WEB_APP_URL first.");
  process.exit(1);
}

async function hit(action, params = {}) {
  const u = new URL(BASE);
  u.searchParams.set("action", action);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const res = await fetch(u.toString());
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text.slice(0, 200); }
  console.log(`\n[${action}] HTTP ${res.status}`);
  console.log(json);
  return res.ok;
}

(async () => {
  const healthOk = await hit("health");
  await hit("status", { email: "nobody@example.com" }); // expect { ok:true, records:[] }
  console.log("\n" + (healthOk ? "✅ Web App reachable." : "❌ Health check failed."));
  process.exit(healthOk ? 0 : 1);
})();
