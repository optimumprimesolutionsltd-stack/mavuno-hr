import { Router } from "express";
import { eq, and, desc, inArray } from "drizzle-orm";
import { db } from "@workspace/db";
import { payrollRuns, statutoryFilings } from "@workspace/db/schema";
import { requireAuth, type AuthRequest } from "../middlewares/require-auth.js";
import { HttpError } from "../lib/http-error.js";
import { writeAudit } from "../lib/audit.js";
import { getIp } from "../middlewares/require-auth.js";

const router = Router();

const FILING_KINDS = ["P10", "NSSF", "SHIF", "AHL"] as const;
type FilingKind = (typeof FILING_KINDS)[number];

/**
 * GET /api/filings
 * Returns a cross-period grid of statutory filing statuses.
 * Each row = one calendar month (period), one entry per filing kind.
 */
router.get("/", requireAuth("payroll:read"), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const orgId = p.orgId;

    // Fetch all paid/approved payroll runs ordered by period descending (up to 24 months)
    const runs = await db
      .select({
        id: payrollRuns.id,
        period: payrollRuns.period,
        name: payrollRuns.name,
        status: payrollRuns.status,
        employeeCount: payrollRuns.employeeCount,
        payeTotal: payrollRuns.payeTotal,
        nssfEmployeeTotal: payrollRuns.nssfEmployeeTotal,
        nssfEmployerTotal: payrollRuns.nssfEmployerTotal,
        shifTotal: payrollRuns.shifTotal,
        paidAt: payrollRuns.paidAt,
      })
      .from(payrollRuns)
      .where(eq(payrollRuns.orgId, orgId))
      .orderBy(desc(payrollRuns.period))
      .limit(24);

    if (runs.length === 0) {
      res.json({ periods: [], outstanding: [] });
      return;
    }

    const runIds = runs.map((r) => r.id);

    // Fetch all filings for these runs
    const filings = await db
      .select()
      .from(statutoryFilings)
      .where(and(
        eq(statutoryFilings.orgId, orgId),
        inArray(statutoryFilings.runId, runIds),
      ));

    // Group filings by runId → kind
    const filingsByRunKind: Record<number, Record<string, typeof filings[0]>> = {};
    for (const f of filings) {
      if (f.runId == null) continue;
      if (!filingsByRunKind[f.runId]) filingsByRunKind[f.runId] = {};
      filingsByRunKind[f.runId][f.kind] = f;
    }

    // Build grid — one row per run/period
    const periods = runs.map((run) => {
      const runFilings = filingsByRunKind[run.id] ?? {};
      const filingMap: Record<string, typeof filings[0] | null> = {};
      for (const kind of FILING_KINDS) {
        filingMap[kind] = runFilings[kind] ?? null;
      }
      return {
        period: run.period,
        runId: run.id,
        runName: run.name,
        runStatus: run.status,
        employeeCount: run.employeeCount,
        paidAt: run.paidAt,
        filings: filingMap,
      };
    });

    // Outstanding = current (latest) period where run is paid/approved but filing not downloaded
    const currentPeriod = new Date().toISOString().slice(0, 7); // YYYY-MM
    const currentRun = runs.find((r) => r.period === currentPeriod) ?? runs[0];
    const outstanding: string[] = [];

    if (currentRun && ["paid", "approved"].includes(currentRun.status)) {
      const cf = filingsByRunKind[currentRun.id] ?? {};
      for (const kind of FILING_KINDS) {
        if (!cf[kind]) outstanding.push(kind);
      }
    }

    res.json({ periods, outstanding, currentPeriod });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/filings/:id/confirm
 * Manually mark a filing as "filed" (confirms it was submitted to the authority).
 */
router.patch("/:id/confirm", requireAuth("payroll:submit"), async (req, res, next) => {
  try {
    const p = (req as AuthRequest).principal;
    const id = Number(req.params.id);

    const [filing] = await db
      .select()
      .from(statutoryFilings)
      .where(and(eq(statutoryFilings.id, id), eq(statutoryFilings.orgId, p.orgId)));

    if (!filing) throw new HttpError(404, "Filing not found");

    const [updated] = await db
      .update(statutoryFilings)
      .set({ status: "filed", filedAt: new Date(), confirmedByUserId: p.userId, confirmedByEmail: p.email })
      .where(and(eq(statutoryFilings.id, id), eq(statutoryFilings.orgId, p.orgId)))
      .returning();

    await db.transaction(async (tx) => {
      await writeAudit(tx as any, {
        orgId: p.orgId,
        action: "FILING_CONFIRMED",
        entity: "statutory_filings",
        entityId: id,
        detail: `${filing.kind} for ${filing.period} marked as filed`,
        actorUserId: p.userId,
        actorEmail: p.email,
        actorIp: getIp(req),
        before: { status: filing.status },
        after: { status: "filed" },
      });
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

export default router;
