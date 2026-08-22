import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { leaveRequests, leaveDocuments } from "@/db/schema";
import { route, HttpError } from "@/lib/auth/guard";
import { withTenant } from "@/db/tenant";
import { readDocument } from "@/lib/documentStorage";

export const GET = route({ permission: "self:read" }, async ({ principal, params }) =>
  withTenant(principal.orgId, async (tx) => {
    const leaveId = Number(params.id);
    const docId = Number(params.docId);
    if (!principal.employeeId) throw new HttpError(400, "No employee is linked to your login");

    const [leave] = await tx.select().from(leaveRequests).where(and(
      eq(leaveRequests.id, leaveId), eq(leaveRequests.orgId, principal.orgId),
    ));
    if (!leave || leave.employeeId !== principal.employeeId) {
      throw new HttpError(404, "Not found");
    }

    const [doc] = await tx.select().from(leaveDocuments).where(and(
      eq(leaveDocuments.id, docId), eq(leaveDocuments.orgId, principal.orgId),
    ));
    if (!doc || doc.leaveRequestId !== leave.id) throw new HttpError(404, "Not found");

    const buffer = await readDocument(doc.storageKey);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": doc.mimeType,
        "Content-Disposition": `inline; filename="${doc.fileName}"`,
      },
    });
  }),
);
