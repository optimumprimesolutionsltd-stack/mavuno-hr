import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { payrollRuns, payslips, employees, organizations, payoutBatches } from "@/db/schema";
import { route, HttpError } from "@/lib/auth/guard";
import { withTenant } from "@/db/tenant";
import { generateBankEft, generateMpesaB2c, generatePain001, type PayoutItem } from "@/lib/payouts/generate";
import { writeAudit } from "@/lib/audit";
import { z } from "zod";

const schema = z.object({
  channel: z.enum(["bank_eft", "pesalink", "mpesa_b2c"]),
  valueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  debitAccount: z.string().min(4).max(34),
  debitBic: z.string().max(11).optional(),
  shortCode: z.string().max(10).optional(),
});

/**
 * Generate the file that actually moves the money.
 *
 * Gated on payroll:disburse and on the run being APPROVED — you cannot generate
 * a payment instruction for a run nobody has signed off. Every file is hashed
 * and recorded, so "what exactly did we send the bank on the 28th" is
 * answerable months later.
 */
export const POST = route(
  { permission: "payroll:disburse", schema },
  async ({ principal, body, params, ip }) =>
    withTenant(principal.orgId, async (tx) => {
      const runId = Number(params.id);

      const [run] = await tx.select().from(payrollRuns)
        .where(and(eq(payrollRuns.id, runId), eq(payrollRuns.orgId, principal.orgId)));
      if (!run) throw new HttpError(404, "Payroll run not found");
      if (!["approved", "paid"].includes(run.status)) {
        throw new HttpError(409, `Cannot generate a payout file for a run that is ${run.status}. Approve it first.`);
      }

      const [org] = await tx.select().from(organizations).where(eq(organizations.id, principal.orgId));

      const rows = await tx
        .select({ p: payslips, e: employees })
        .from(payslips)
        .innerJoin(employees, eq(payslips.employeeId, employees.id))
        .where(and(eq(payslips.runId, runId), eq(payslips.orgId, principal.orgId)));

      const items: PayoutItem[] = rows.map(({ p, e }) => ({
        employeeId: e.id, empNo: e.empNo, name: `${e.firstName} ${e.lastName}`,
        netPay: p.netPay, payMethod: e.payMethod as PayoutItem["payMethod"],
        bankCode: e.bankCode, bankBranchCode: e.bankBranchCode, bankAccount: e.bankAccount,
        mpesaPhone: e.mpesaPhone, nationalId: e.nationalId,
      }));

      const reference = `PR${run.period.replace("-", "")}-${run.id}`;
      const common = { orgName: org.name, debitAccount: body.debitAccount, valueDate: body.valueDate, period: run.period, reference };

      const file =
        body.channel === "mpesa_b2c"
          ? generateMpesaB2c(items, { shortCode: body.shortCode ?? "", period: run.period, reference })
          : body.channel === "pesalink"
          ? generatePain001(items, {
              ...common, orgId: org.kraPin ?? String(org.id),
              debitBic: body.debitBic ?? "", createdAt: new Date().toISOString(),
            })
          : generateBankEft(items, common);

      const [batch] = await tx.insert(payoutBatches).values({
        orgId: principal.orgId, runId, channel: file.channel, format: file.format,
        itemCount: file.itemCount, totalAmount: file.totalAmount, checksum: file.checksum,
        generatedByUserId: principal.userId,
      }).returning();

      await writeAudit(tx, {
        orgId: principal.orgId, action: "PAYOUT_FILE_GENERATED", entity: "payout_batches", entityId: batch.id,
        detail: `${file.channel} file for ${run.name}: ${file.itemCount} payees, ${file.totalAmount / 100}, sha256 ${file.checksum.slice(0, 16)}…${file.rejected.length ? `, ${file.rejected.length} row(s) rejected` : ""}`,
        actorUserId: principal.userId, actorEmail: principal.email, actorIp: ip,
        after: { channel: file.channel, itemCount: file.itemCount, totalAmount: file.totalAmount, checksum: file.checksum },
      });

      return NextResponse.json({
        batchId: batch.id,
        filename: file.filename,
        content: file.content,
        itemCount: file.itemCount,
        totalAmount: file.totalAmount,
        checksum: file.checksum,
        /* Rejections are returned prominently, not buried. Someone has to fix
         * these before payday, and they need to know now. */
        rejected: file.rejected,
      }, { status: 201 });
    }),
);
