/**
 * auth.ts — client-side dashboard token store (§1.6 / X5).
 * The signed HMAC token is kept in localStorage with its expiry so the user is
 * not re-prompted for the token's lifetime (default 7 days), even across tabs.
 */

const KEY = "surge-auth";

interface Stored { token: string; exp: number; }

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Stored;
    if (!s.token || !s.exp || Date.now() > s.exp) {
      window.localStorage.removeItem(KEY);
      return null;
    }
    return s.token;
  } catch {
    return null;
  }
}

export function setStoredToken(token: string, expiresInDays = 7): void {
  if (typeof window === "undefined") return;
  const exp = Date.now() + expiresInDays * 86400000;
  window.localStorage.setItem(KEY, JSON.stringify({ token, exp } as Stored));
}

export function clearToken(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
}

export function isAuthed(): boolean {
  return getStoredToken() !== null;
}
