import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { z, ZodType } from "zod";
import { getPrincipal, type Principal } from "./session";
import { can, type Permission } from "./rbac";

export class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

type Handler<B> = (ctx: {
  principal: Principal;
  body: B;
  req: Request;
  params: Record<string, string>;
  ip: string | null;
}) => Promise<Response> | Response;

/**
 * THE route guard.
 *
 * Every mutating/reading API route is wrapped in this. It is deliberately the
 * only way to write a handler, so that authentication cannot be forgotten:
 * a route that doesn't call `route()` has no `principal` to work with, and
 * every downstream query requires the orgId that only `principal` provides.
 *
 * Responsibilities, in order:
 *   1. Authenticate (session cookie -> Principal, or 401)
 *   2. Authorise (RBAC permission, or 403)
 *   3. CSRF (Origin check on state-changing verbs)
 *   4. Validate the body with a Zod schema (or 422)
 *   5. Convert thrown HttpErrors into clean JSON, and log anything unexpected
 *      WITHOUT leaking internals to the client
 */
export function route<B = unknown>(opts: {
  permission: Permission | null;    // null = any authenticated user
  schema?: ZodType<B>;
  allowPasswordChangePending?: boolean;
}, handler: Handler<B>) {
  return async (req: Request, ctx?: { params?: Promise<Record<string, string>> }) => {
    try {
      /* 1. AUTHENTICATE */
      const principal = await getPrincipal();
      if (!principal) {
        return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
      }

      /* A user who must rotate a temp password can do nothing else. */
      if (principal.mustChangePassword && !opts.allowPasswordChangePending) {
        return NextResponse.json(
          { error: "Password change required", code: "PASSWORD_CHANGE_REQUIRED" },
          { status: 403 },
        );
      }

      /* 2. AUTHORISE */
      if (opts.permission && !can(principal.role, opts.permission)) {
        return NextResponse.json(
          { error: `Your role (${principal.role}) is not permitted to do this` },
          { status: 403 },
        );
      }

      /* 3. CSRF — SameSite=strict is the primary defence; Origin is belt-and-braces
       *    for browsers/proxies that mishandle it. */
      const method = req.method.toUpperCase();
      if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
        const h = await headers();
        const origin = h.get("origin");
        const host = h.get("host");
        if (origin && host && new URL(origin).host !== host) {
          return NextResponse.json({ error: "Cross-origin request blocked" }, { status: 403 });
        }
      }

      /* 4. VALIDATE */
      let body = {} as B;
      if (opts.schema) {
        const raw = await req.json().catch(() => ({}));
        const parsed = opts.schema.safeParse(raw);
        if (!parsed.success) {
          return NextResponse.json(
            { error: "Validation failed", issues: z.treeifyError(parsed.error) },
            { status: 422 },
          );
        }
        body = parsed.data;
      }

      const params = ctx?.params ? await ctx.params : {};
      const h = await headers();
      const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

      return await handler({ principal, body, req, params, ip });
    } catch (err) {
      if (err instanceof HttpError) {
        return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
      }
      /* Never leak stack traces or SQL to the client. */
      console.error("[unhandled]", err);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  };
}
