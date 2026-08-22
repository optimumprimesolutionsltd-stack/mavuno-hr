import { NextResponse, type NextRequest } from "next/server";

/**
 * Edge middleware — the outer perimeter.
 *
 * The route guard (src/lib/auth/guard.ts) is the real authorisation boundary,
 * because only it can reach the database to validate a session. This middleware
 * is the cheap first pass: it blocks unauthenticated traffic to admin pages and
 * APIs before it costs a DB round-trip, and it sets security headers.
 *
 * Note it only checks that a cookie is PRESENT, not that it is valid — a forged
 * cookie gets past here and is rejected by the guard. That is deliberate: edge
 * runtime has no DB access. Never rely on this alone.
 */
const PUBLIC = ["/login", "/api/auth/login", "/api/health", "/_next", "/favicon.ico"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const hasSession = req.cookies.has("zawadi_session");

  if (!hasSession) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  const res = NextResponse.next();
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  res.headers.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'",
  );
  res.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
