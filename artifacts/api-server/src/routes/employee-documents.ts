import { Router } from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@workspace/db";
import { employees, employeeDocuments } from "@workspace/db/schema";
import { requireAuth, type AuthRequest, getIp } from "../middlewares/require-auth.js";
import { writeAudit } from "../lib/audit.js";
import { HttpError } from "../lib/http-error.js";
import * as r2 from "../lib/r2.js";

// Employee photo and supporting documents (certificates, ID scans, resumes,
// contracts, disciplinary letters, leave documents, ...) -- split out from
// employees.ts, which is already large, mirroring how loans.ts/timesheets.ts
// are their own routers. Files live in Cloudflare R2, always private: every
// read and write goes through these authenticated routes, never a public URL
// -- appropriate given documents here include national ID scans.

const router = Router();

const DOCUMENT_CATEGORIES = [
  "passport_photo", "certificate", "nssf_card", "shif_card", "id_card_scan",
  "resume", "contract", "disciplinary_letter", "leave_document", "other",
] as const;

const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, /^image\/(jpeg|png|webp)$/.test(file.mimetype)),
});
const documentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

async function requireEmployee(orgId: number, id: number) {
  const [emp] = await db.select().from(employees).where(and(eq(employees.id, id), eq(employees.orgId, orgId)));
  if (!emp) throw new HttpError(404, "Employee not found");
  return emp;
}

// ── Photo ────────────────────────────────────────────────────────────────
router.post("/:id/photo", requireAuth("employee:write"), photoUpload.single("file"), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const id = Number(req.params.id);
    const emp = await requireEmployee(p.orgId, id);
    if (!req.file) throw new HttpError(422, "A photo file is required");

    const key = `org-${p.orgId}/employees/${id}/photo/${randomUUID()}`;
    await r2.putObject(key, req.file.buffer, req.file.mimetype);
    const oldKey = emp.photoKey;

    await db.update(employees)
      .set({ photoKey: key, photoMimeType: req.file.mimetype })
      .where(and(eq(employees.id, id), eq(employees.orgId, p.orgId)));

    // Best-effort: the new photo is already saved and pointed at, so a
    // failure to clean up the old object is orphaned storage, not a bug the
    // caller needs to see.
    if (oldKey) {
      try { await r2.deleteObject(oldKey); } catch { /* best-effort cleanup */ }
    }

    await db.transaction(async (tx) => {
      await writeAudit(tx as any, {
        orgId: p.orgId, action: "EMPLOYEE_PHOTO_UPDATED", entity: "employees", entityId: id,
        actorUserId: p.userId, actorEmail: p.email, actorIp: getIp(req),
      });
    });

    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.get("/:id/photo", requireAuth("employee:read"), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const id = Number(req.params.id);
    const emp = await requireEmployee(p.orgId, id);
    if (!emp.photoKey) { res.status(404).json({ error: "No photo on file" }); return; }

    const { body, contentType } = await r2.getObject(emp.photoKey);
    res.setHeader("Content-Type", contentType ?? emp.photoMimeType ?? "application/octet-stream");
    body.pipe(res);
  } catch (err) { next(err); }
});

router.delete("/:id/photo", requireAuth("employee:write"), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const id = Number(req.params.id);
    const emp = await requireEmployee(p.orgId, id);
    if (emp.photoKey) {
      try { await r2.deleteObject(emp.photoKey); } catch { /* best-effort */ }
    }
    await db.update(employees).set({ photoKey: null, photoMimeType: null })
      .where(and(eq(employees.id, id), eq(employees.orgId, p.orgId)));
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── Documents ────────────────────────────────────────────────────────────
router.get("/:id/documents", requireAuth("employee:read"), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const id = Number(req.params.id);
    await requireEmployee(p.orgId, id);
    const rows = await db.select().from(employeeDocuments)
      .where(and(eq(employeeDocuments.employeeId, id), eq(employeeDocuments.orgId, p.orgId)))
      .orderBy(desc(employeeDocuments.uploadedAt));
    res.json(rows);
  } catch (err) { next(err); }
});

const categorySchema = z.enum(DOCUMENT_CATEGORIES);

router.post("/:id/documents", requireAuth("employee:write"), documentUpload.single("file"), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const id = Number(req.params.id);
    await requireEmployee(p.orgId, id);
    if (!req.file) throw new HttpError(422, "A file is required");
    const parsedCategory = categorySchema.safeParse(req.body.category);
    if (!parsedCategory.success) throw new HttpError(422, "Invalid or missing category");

    const key = `org-${p.orgId}/employees/${id}/documents/${randomUUID()}-${req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    await r2.putObject(key, req.file.buffer, req.file.mimetype);

    const [row] = await db.insert(employeeDocuments).values({
      orgId: p.orgId, employeeId: id, category: parsedCategory.data,
      fileName: req.file.originalname, storageKey: key,
      mimeType: req.file.mimetype, size: req.file.size,
      uploadedByUserId: p.userId,
    }).returning();

    await db.transaction(async (tx) => {
      await writeAudit(tx as any, {
        orgId: p.orgId, action: "EMPLOYEE_DOCUMENT_UPLOADED", entity: "employee_documents", entityId: row.id,
        actorUserId: p.userId, actorEmail: p.email, actorIp: getIp(req),
        after: { category: row.category, fileName: row.fileName },
      });
    });

    res.status(201).json(row);
  } catch (err) { next(err); }
});

router.get("/:id/documents/:documentId/download", requireAuth("employee:read"), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const id = Number(req.params.id);
    const documentId = Number(req.params.documentId);
    const [doc] = await db.select().from(employeeDocuments)
      .where(and(eq(employeeDocuments.id, documentId), eq(employeeDocuments.employeeId, id), eq(employeeDocuments.orgId, p.orgId)));
    if (!doc) { res.status(404).json({ error: "Document not found" }); return; }

    const { body, contentType } = await r2.getObject(doc.storageKey);
    res.setHeader("Content-Type", contentType ?? doc.mimeType);
    res.setHeader("Content-Disposition", `attachment; filename="${doc.fileName.replace(/"/g, "")}"`);
    body.pipe(res);
  } catch (err) { next(err); }
});

router.delete("/:id/documents/:documentId", requireAuth("employee:write"), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const id = Number(req.params.id);
    const documentId = Number(req.params.documentId);
    const [doc] = await db.select().from(employeeDocuments)
      .where(and(eq(employeeDocuments.id, documentId), eq(employeeDocuments.employeeId, id), eq(employeeDocuments.orgId, p.orgId)));
    if (!doc) { res.status(404).json({ error: "Document not found" }); return; }

    try { await r2.deleteObject(doc.storageKey); } catch { /* best-effort */ }
    await db.delete(employeeDocuments).where(eq(employeeDocuments.id, documentId));

    await db.transaction(async (tx) => {
      await writeAudit(tx as any, {
        orgId: p.orgId, action: "EMPLOYEE_DOCUMENT_DELETED", entity: "employee_documents", entityId: documentId,
        actorUserId: p.userId, actorEmail: p.email, actorIp: getIp(req),
        before: { category: doc.category, fileName: doc.fileName },
      });
    });

    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
