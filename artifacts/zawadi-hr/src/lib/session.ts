/**
 * Client-side session token management.
 *
 * The API returns a raw session token on login. We store it in sessionStorage
 * and send it as `Authorization: Bearer <token>` on every request.
 * This bypasses the third-party cookie restriction that blocks httpOnly cookies
 * inside Replit's cross-site iframe preview.
 */

const KEY = "zawadi_session_token";

export function storeToken(token: string): void {
  sessionStorage.setItem(KEY, token);
}

export function getToken(): string | null {
  return sessionStorage.getItem(KEY);
}

export function clearToken(): void {
  sessionStorage.removeItem(KEY);
}
