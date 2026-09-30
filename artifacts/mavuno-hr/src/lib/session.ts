/**
 * Client-side session token management.
 *
 * The API returns a raw session token on login. We store it in sessionStorage
 * and send it as `Authorization: Bearer <token>` on every request.
 * This bypasses the third-party cookie restriction that blocks httpOnly cookies
 * inside Replit's cross-site iframe preview.
 */

const KEY = "mavuno_session_token";

/*
 * Called whenever the signed-in session changes (login, Google sign-in,
 * logout). App.tsx wires it to queryClient.clear(): cached API data is keyed
 * by URL only, so without this, signing out of one company and into another
 * showed the first company's figures until the cache expired (up to 5 min).
 */
let sessionChanged: () => void = () => {};
export function onSessionChange(fn: () => void): void {
  sessionChanged = fn;
}

export function storeToken(token: string): void {
  sessionStorage.setItem(KEY, token);
  sessionChanged();
}

export function getToken(): string | null {
  return sessionStorage.getItem(KEY);
}

export function clearToken(): void {
  sessionStorage.removeItem(KEY);
  sessionChanged();
}
