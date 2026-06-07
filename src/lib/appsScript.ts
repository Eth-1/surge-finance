/**
 * appsScript.ts — server-side gateway to the Apps Script Web App (§6.1, §6.4).
 *
 * All Vercel data flows through here (never the browser → Sheets directly). The
 * token/password travel as query params (Apps Script can't read headers) but
 * only server-side, so they are never exposed to the client. Implements
 * exponential backoff with jitter and ISR tags/revalidate.
 */

const BASE_URL = process.env.APPS_SCRIPT_WEB_APP_URL || "";

const MAX_RETRIES = 3;
const RETRYABLE = new Set([429, 500, 502, 503]);

export class AppsScriptError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "AppsScriptError";
    this.status = status;
  }
}

export type FetchOptions = {
  params?: Record<string, string | number | undefined | null>;
  token?: string;
  /** ISR window in seconds, or false to opt out of caching. */
  revalidate?: number | false;
  tags?: string[];
  method?: "GET" | "POST";
  body?: unknown;
};

function buildUrl(action: string, params: FetchOptions["params"], token?: string): string {
  const u = new URL(BASE_URL);
  u.searchParams.set("action", action);
  if (token) u.searchParams.set("token", token);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== "") u.searchParams.set(k, String(v));
    }
  }
  return u.toString();
}

function backoffDelay(attempt: number): number {
  // §6.4: min(2^attempt * 100ms + jitter(0–100ms), 30000ms)
  return Math.min(Math.pow(2, attempt) * 100 + Math.floor(Math.random() * 100), 30000);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Fetch an Apps Script endpoint with backoff. Returns the parsed JSON (which may
 * carry an `{ error }` field — callers narrow on it). Throws AppsScriptError on
 * network failure or a non-recoverable / exhausted HTTP error.
 */
export async function fetchAppsScript<T>(action: string, options: FetchOptions = {}): Promise<T> {
  if (!BASE_URL) {
    throw new AppsScriptError("APPS_SCRIPT_WEB_APP_URL is not configured.", 0);
  }
  const { params, token, revalidate = 180, tags, method = "GET", body } = options;
  const url = buildUrl(action, params, token);

  const init: RequestInit & { next?: { revalidate?: number | false; tags?: string[] } } = {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  };
  if (method === "POST") {
    init.cache = "no-store";
  } else {
    init.next = { revalidate, tags };
  }

  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, init);
      if (res.ok) {
        return (await res.json()) as T;
      }
      if (RETRYABLE.has(res.status) && attempt < MAX_RETRIES) {
        await sleep(backoffDelay(attempt));
        continue;
      }
      throw new AppsScriptError(`Apps Script responded ${res.status}`, res.status);
    } catch (err) {
      lastErr = err;
      // Network/parse errors are retryable; non-retryable HTTP errors rethrow.
      if (err instanceof AppsScriptError && !RETRYABLE.has(err.status)) throw err;
      if (attempt < MAX_RETRIES) {
        await sleep(backoffDelay(attempt));
        continue;
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new AppsScriptError("Apps Script request failed", 0);
}

/** POST the password to authCheck (handshake). Never cached. */
export async function postAuthCheck(
  password: string
): Promise<{ ok?: boolean; token?: string; expiresInDays?: number; error?: string }> {
  return fetchAppsScript("authCheck", { method: "POST", body: { password }, revalidate: false });
}
