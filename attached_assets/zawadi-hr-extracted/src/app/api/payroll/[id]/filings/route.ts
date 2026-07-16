import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { payrollRuns, payslips, employees, organizations, statutoryFilings } from "@/db/schema";
import { route, HttpError } from "@/lib/auth/guard";
import { withTenant } from "@/db/tenant";
import { generateP10, generateNssf, generateShif, generateAhl, reconcile, type FilingRow } from "@/lib/statutory/filings";
import { writeAudit } from "@/lib/audit";
import { z } from "zod";

const schema = z.object({ kind: z.enum(["P10", "NSSF", "SHIF", "AHL", "ALL"]) });

/** Statutory returns: the compliance deliverable that justifies the licence fee. */
export const POST = route(
  { permission: "report:read", schema },
  async ({ principal, body, params, ip }) =>
    withTenant(principal.orgId, async (tx) => {
      const runId = Number(params.id);

      const [run] = await tx.select().from(payrollRuns)
        .where(and(eq(payrollRuns.id, runId), eq(payrollRuns.orgId, principal.orgId)));
      if (!run) throw new HttpError(404, "Payroll run not found");

      const [org] = await tx.select().from(organizations).where(eq(organizations.id, principal.orgId));

      const joined = await tx
        .select({ p: payslips, e: employees })
        .from(payslips)
        .innerJoin(employees, eq(payslips.employeeId, employees.id))
        .where(and(eq(payslips.runId, runId), eq(payslips.orgId, principal.orgId)));

      const rows: FilingRow[] = joined.map(({ p, e }) => ({
        empNo: e.empNo, firstName: e.firstName, lastName: e.lastName,
        kraPin: e.kraPin, nationalId: e.nationalId, nssfNo: e.nssfNo, shifNo: e.shifNo,
        employmentType: e.employmentType, residentStatus: e.residentStatus,
        disabilityExemption: e.disabilityExemption,
        basic: p.basic, allowances: p.allowances, nonCashBenefit: p.nonCashBenefit, gross: p.gross,
        nssfEmployee: p.nssfEmployee, nssfEmployer: p.nssfEmployer, shif: p.shif,
        housingLevyEmployee: p.housingLevyEmployee, housingLevyEmployer: p.housingLevyEmployer,
        pension: p.pension, mortgageInterest: p.mortgageInterest,
        taxableIncome: p.taxableIncome, payeBeforeRelief: p.payeBeforeRelief,
        personalRelief: p.personalRelief, insuranceRelief: p.insuranceRelief, paye: p.paye,
      }));

      const pin = org.kraPin ?? "";
      const wanted = body.kind === "ALL" ? ["P10", "NSSF", "SHIF", "AHL"] : [body.kind];

      const files = wanted.map((k) => {
        switch (k) {
          case "P10":  return generateP10(rows,  { employerPin: pin, employerName: org.name, period: run.period });
          case "NSSF": return generateNssf(rows, { employerNo: org.nssfEmployerNo ?? "", employerName: org.name, period: run.period });
          case "SHIF": return generateShif(rows, { employerNo: org.shifEmployerNo ?? "", employerName: org.name, period: run.period });
          default:     return generateAhl(rows,  { employerPin: pin, employerName: org.name, period: run.period });
        }
      });

      for (const f of files) {
        await tx.insert(statutoryFilings).values({
          orgId: principal.orgId, runId, kind: f.kind, period: run.period,
          itemCount: f.itemCount, totalAmount: f.totalAmount, checksum: f.checksum,
        });
      }

      await writeAudit(tx, {
        orgId: principal.orgId, action: "STATUTORY_FILING_GENERATED", entity: "statutory_filings",
        entityId: runId,
        detail: `${files.map((f) => f.kind).join(", ")} generated for ${run.period}`,
        actorUserId: principal.userId, actorEmail: principal.email, actorIp: ip,
      });

      return NextResponse.json({
        files: files.map((f) => ({
          kind: f.kind, filename: f.filename, content: f.content,
          itemCount: f.itemCount, totalAmount: f.totalAmount,
          checksum: f.checksum, exceptions: f.exceptions,
        })),
        /* What Finance posts to the GL and remits to each regulator. */
        reconciliation: reconcile(rows),
      }, { status: 201 });
    }),
);
