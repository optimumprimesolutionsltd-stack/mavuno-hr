import { NextResponse } from "next/server";
import { route, HttpError } from "@/lib/auth/guard";
import { withTenant } from "@/db/tenant";
import { getEmployeeP9 } from "@/lib/p9";

export const GET = route({ permission: "self:read" }, async ({ principal, req }) =>
  withTenant(principal.orgId, async (tx) => {
    if (!principal.employeeId) throw new HttpError(400, "No employee is linked to your login");

    const year = new URL(req.url).searchParams.get("year") ?? String(new Date().getFullYear());
    if (!/^\d{4}$/.test(year)) throw new HttpError(422, "Year must be YYYY");

    const p9 = await getEmployeeP9(tx, principal.orgId, principal.employeeId, year);
    if (!p9) throw new HttpError(404, "Employee not found");

    return NextResponse.json({ ...p9, currency: principal.currencyCode });
  }),
);
