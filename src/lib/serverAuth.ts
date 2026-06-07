import { cookies } from "next/headers";

/**
 * Read the dashboard token from the `surge-auth` cookie (server-side only).
 * Protected Server Component pages use this to authorize their Apps Script
 * fetches; an empty result (or an `unauthorized` API response) means the page
 * should render the AuthGate prompt instead of data.
 */
export function getServerToken(): string {
  try {
    return cookies().get("surge-auth")?.value || "";
  } catch {
    return "";
  }
}
