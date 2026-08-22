import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { leaveRequests, leaveDocuments } from "@/db/schema";
import { route, HttpError } from "@/lib/auth/guard";
import { withTenant } from "@/db/tenant";
import { ALLOWED_DOC_TYPES, MAX_DOC_SIZE, generateStorageKey, saveDocument, sha256 } from "@/lib/documentStorage";
import { writeAudit } from "@/lib/audit";

/**
 * Attach a supporting document (sick note) to a leave request.
 *
 * Not behind the generic `route()` JSON-schema path because this is a
 * multipart upload, but it goes through the same authenticate -> authorise ->
 * tenant-scope pipeline by hand.
 */
export const POST = route({ permission: "self:request" }, async ({ principal, req, params, ip }) =>
  withTenant(principal.orgId, async (tx) => {
    const leaveId = Number(params.id);
    if (!principal.employeeId) throw new HttpError(400, "No employee is linked to your login");

    const [leave] = await tx.select().from(leaveRequests).where(and(
      eq(leaveRequests.id, leaveId), eq(leaveRequests.orgId, principal.orgId),
    ));
    if (!leave || leave.employeeId !== principal.employeeId) {
      throw new HttpError(404, "Leave request not found");
    }
    if (leave.type !== "sick") {
      throw new HttpError(422, "Supporting documents can only be attached to sick leave requests");
    }
    if (leave.status !== "pending") {
      throw new HttpError(409, "Cannot attach a document to a leave request that has already been decided");
    }

    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) throw new HttpError(422, "No file provided");
    if (!ALLOWED_DOC_TYPES.includes(file.type)) {
      throw new HttpError(422, "Only PDF, JPG, PNG or WEBP files are allowed");
    }
    if (file.size > MAX_DOC_SIZE) throw new HttpError(422, "File must be under 5MB");

    const buffer = Buffer.from(await file.arrayBuffer());
    const storageKey = generateStorageKey(principal.orgId, leaveId, file.name);
    await saveDocument(storageKey, buffer, file.type);

    const [row] = await tx.insert(leaveDocuments).values({
      orgId: principal.orgId,
      leaveRequestId: leaveId,
      fileName: file.name,
      storageKey,
      mimeType: file.type,
      size: file.size,
      checksum: sha256(buffer),
    }).returning();

    await writeAudit(tx, {
      orgId: principal.orgId, action: "LEAVE_DOCUMENT_UPLOADED", entity: "leave_documents", entityId: row.id,
      detail: `Sick note "${file.name}" (${(file.size / 1024).toFixed(0)}KB) attached to leave request #${leaveId}`,
      actorUserId: principal.userId, actorEmail: principal.email, actorIp: ip,
    });

    return NextResponse.json(
      { id: row.id, fileName: row.fileName, uploadedAt: row.uploadedAt, size: row.size },
      { status: 201 },
    );
  }),
);
