import { NextResponse } from "next/server";
import { and, eq, ne, desc } from "drizzle-orm";
import { z } from "zod";
import { employees, payrollRuns, leaveRequests, loans, departments, organizations } from "@/db/schema";
import { route } from "@/lib/auth/guard";
import { withTenant } from "@/db/tenant";
import { computePayslip, emptyPayInput } from "@/lib/payroll";
import { resolveConfig } from "@/lib/statutory/resolve";
import { kes } from "@/lib/format";
import { toCents, type Cents } from "@/lib/money";

type Table = { columns: string[]; rows: (string | number)[][] } | null;

/** Parse "200k", "1.5m", "200,000" from free text into CENTS. */
function parseAmountCents(text: string): Cents | null {
  const m = text.replace(/,/g, "").match(/(\d+(?:\.\d+)?)\s*(k|thousand|m|million)?/i);
  if (!m) return null;
  let n = Number(m[1]);
  const suffix = (m[2] || "").toLowerCase();
  if (suffix === "k" || suffix === "thousand") n *= 1_000;
  if (suffix === "m" || suffix === "million") n *= 1_000_000;
  return toCents(n.toFixed(2));
}

const schema = z.object({ message: z.string().min(1).max(1000) });

/**
 * "Zawadi AI" copilot — keyword-matched analytics over the org's own data.
 *
 * Now behind the guard like everything else: the previous version answered
 * salary questions to ANY unauthenticated caller. It also requires report:read,
 * because these answers expose org-wide salary data — an ordinary employee
 * asking "top earners" must get a 403, not the CFO's salary.
 */
export const POST = route(
  { permission: "report:read", schema },
  async ({ principal, body }) =>
    withTenant(principal.orgId, async (tx) => {
      const q = body.message.toLowerCase();

      const staff = await tx
        .select({ e: employees, d: departments })
        .from(employees)
        .leftJoin(departments, eq(employees.departmentId, departments.id))
        .where(and(eq(employees.orgId, principal.orgId), ne(employees.status, "terminated")));

      const grossOf = (e: (typeof staff)[number]["e"]): Cents =>
        e.basicSalary + e.houseAllowance + e.transportAllowance + e.otherAllowance;

      let reply = "";
      let table: Table = null;

      /* ---- earning above / below X ---- */
      if (/(earn|salary|paid|gross).*(above|over|more than|greater|below|under|less than)/.test(q) || /(above|over|below|under)\s+[\d,]+/.test(q)) {
        const below = /(below|under|less than)/.test(q);
        const amt = parseAmountCents(q.replace(/.*?(above|over|more than|greater than|below|under|less than)/, "")) ?? toCents("100000");
        const matches = staff
          .map((s) => ({ s, gross: grossOf(s.e) }))
          .filter((x) => (below ? x.gross < amt : x.gross > amt))
          .sort((a, b) => b.gross - a.gross);
        reply = `I found **${matches.length} employee(s)** with gross pay ${below ? "below" : "above"} ${kes(amt)}. Combined monthly gross: ${kes(matches.reduce((a, m) => a + m.gross, 0))}.`;
        table = {
          columns: ["Employee", "Position", "Department", "Gross Pay"],
          rows: matches.map((m) => [`${m.s.e.firstName} ${m.s.e.lastName}`, m.s.e.position, m.s.d?.name || "-", kes(m.gross)]),
        };
      }
      /* ---- who has not taken leave ---- */
      else if (/leave/.test(q) && /(not taken|hasn'?t|no leave|never|full balance|who has not)/.test(q)) {
        const allLeaves = await tx.select().from(leaveRequests).where(eq(leaveRequests.orgId, principal.orgId));
        const withLeave = new Set(allLeaves.filter((l) => l.status === "approved").map((l) => l.employeeId));
        const noLeave = staff.filter((s) => !withLeave.has(s.e.id));
        reply = `**${noLeave.length} employee(s)** have not taken any approved leave. Encourage them to plan leave — accrued liability is a hidden cost, and Kenyan law entitles every employee to 21 working days of annual leave.`;
        table = {
          columns: ["Employee", "Department", "Leave Balance (days)"],
          rows: noLeave.map((s) => [`${s.e.firstName} ${s.e.lastName}`, s.d?.name || "-", (s.e.leaveBalance / 10).toFixed(1)]),
        };
      }
      /* ---- compare payroll ---- */
      else if (/compare|versus|vs\.?|difference/.test(q) && /payroll|month|last/.test(q)) {
        const runs = await tx.select().from(payrollRuns)
          .where(eq(payrollRuns.orgId, principal.orgId))
          .orderBy(desc(payrollRuns.period)).limit(2);
        if (runs.length < 2) {
          reply = runs.length === 1
            ? `I only have one payroll run on record (**${runs[0].name}**, gross ${kes(runs[0].grossTotal)}). Process another period and I'll build a full variance analysis.`
            : "No payroll runs exist yet. Head to **Payroll → Run Payroll** to process your first period.";
        } else {
          const [cur, prev] = runs;
          const pct = (a: Cents, b: Cents) => (b === 0 ? 0 : ((a - b) / b) * 100);
          const grossPct = pct(cur.grossTotal, prev.grossTotal);
          const nssfOf = (r: typeof cur) => r.nssfEmployeeTotal + r.nssfEmployerTotal;
          reply = `**${cur.name} vs ${prev.name}** — Gross moved by ${kes(cur.grossTotal - prev.grossTotal)} (${grossPct.toFixed(1)}%). ${Math.abs(grossPct) > 10 ? "⚠️ Variance exceeds 10% — I recommend reviewing before approval." : "✅ Variance is within the normal 10% tolerance."}`;
          table = {
            columns: ["Metric", cur.name, prev.name, "Δ Change"],
            rows: [
              ["Employees", cur.employeeCount, prev.employeeCount, cur.employeeCount - prev.employeeCount],
              ["Gross", kes(cur.grossTotal), kes(prev.grossTotal), kes(cur.grossTotal - prev.grossTotal)],
              ["PAYE", kes(cur.payeTotal), kes(prev.payeTotal), kes(cur.payeTotal - prev.payeTotal)],
              ["NSSF", kes(nssfOf(cur)), kes(nssfOf(prev)), kes(nssfOf(cur) - nssfOf(prev))],
              ["SHIF", kes(cur.shifTotal), kes(prev.shifTotal), kes(cur.shifTotal - prev.shifTotal)],
              ["Net Pay", kes(cur.netTotal), kes(prev.netTotal), kes(cur.netTotal - prev.netTotal)],
            ],
          };
        }
      }
      /* ---- explain payslip for <name> ---- */
      else if (/payslip|explain|breakdown|why.*(tax|paye|net)/.test(q)) {
        const target =
          staff.find((s) => q.includes(s.e.firstName.toLowerCase()) || q.includes(s.e.lastName.toLowerCase())) || staff[0];
        if (!target) {
          reply = "There are no active employees yet — add your first employee and I can explain their payslip.";
        } else {
          const e = target.e;
          const period = new Date().toISOString().slice(0, 7);
          const { config } = await resolveConfig(tx, principal.orgId, principal.countryCode, period);
          const r = computePayslip({
            ...emptyPayInput(),
            basicSalary: e.basicSalary,
            houseAllowance: e.houseAllowance,
            transportAllowance: e.transportAllowance,
            otherAllowance: e.otherAllowance,
            nonCashBenefit: e.nonCashBenefit,
            insurancePremium: e.insurancePremium,
            pensionEmployee: e.pensionEmployee,
            pensionEmployer: e.pensionEmployer,
            mortgageInterest: e.mortgageInterest,
            helbMonthly: e.helbMonthly,
            saccoMonthly: e.saccoMonthly,
            employmentType: e.employmentType as "permanent" | "contract" | "casual",
            residentStatus: e.residentStatus as "resident" | "non_resident",
            disabilityExemption: e.disabilityExemption,
          }, config);
          reply = `Here's **${e.firstName} ${e.lastName}**'s payslip explained (computed against "${config.name}"): Gross pay is ${kes(r.gross)} (basic ${kes(r.basic)} + allowances ${kes(r.allowances)}). Statutory deductions: NSSF ${kes(r.nssfEmployee)} (Tier I ${kes(r.nssfTier1)} + Tier II ${kes(r.nssfTier2)}), SHIF ${kes(r.shif)}, Housing Levy ${kes(r.housingLevyEmployee)}. These are deducted **before** tax, giving taxable income of ${kes(r.taxableIncome)}. PAYE across the bands is ${kes(r.payeBeforeRelief)}, less personal relief ${kes(r.personalRelief)} and insurance relief ${kes(r.insuranceRelief)} → PAYE payable ${kes(r.paye)}. **Net pay: ${kes(r.netPay)}** (effective tax rate ${r.gross > 0 ? ((r.paye / r.gross) * 100).toFixed(1) : "0.0"}%). Total cost to employer: ${kes(r.employerCost)}.`;
          table = {
            columns: ["PAYE Band", "Amount Taxed", "Rate", "Tax"],
            rows: r.bands.map((b) => [b.band, kes(b.amount), `${(b.bps / 100).toFixed(1)}%`, kes(b.tax)]),
          };
        }
      }
      /* ---- anomalies ---- */
      else if (/anomal|fraud|suspicious|unusual|outlier|risk/.test(q)) {
        const grosses = staff.map((s) => grossOf(s.e));
        const mean = grosses.length ? grosses.reduce((a, b) => a + b, 0) / grosses.length : 0;
        const std = grosses.length ? Math.sqrt(grosses.reduce((a, b) => a + (b - mean) ** 2, 0) / grosses.length) : 0;
        const flagged = staff.filter((s) => std > 0 && Math.abs(grossOf(s.e) - mean) > 1.8 * std);
        const dupBank = new Map<string, number>();
        staff.forEach((s) => s.e.bankAccount && dupBank.set(s.e.bankAccount, (dupBank.get(s.e.bankAccount) || 0) + 1));
        const dups = [...dupBank.entries()].filter(([, c]) => c > 1);
        const missingPin = staff.filter((s) => !s.e.kraPin).length;
        reply = `Anomaly scan complete across ${staff.length} employees: **${flagged.length} statistical outlier(s)** (>1.8σ from mean gross of ${kes(Math.round(mean))}), **${dups.length} duplicate bank account(s)**, **${missingPin} employee(s) missing a KRA PIN** (their P10 rows will be rejected by iTax). Overall payroll risk: **${dups.length > 0 ? "MEDIUM" : "LOW"}**.`;
        table = {
          columns: ["Employee", "Gross", "Deviation from Mean", "Flag"],
          rows: flagged.map((s) => [
            `${s.e.firstName} ${s.e.lastName}`,
            kes(grossOf(s.e)),
            kes(Math.round(grossOf(s.e) - mean)),
            grossOf(s.e) > mean ? "High outlier" : "Low outlier",
          ]),
        };
      }
      /* ---- loans ---- */
      else if (/loan|advance|debt|owe/.test(q)) {
        const rows = await tx
          .select({ l: loans, e: employees })
          .from(loans)
          .innerJoin(employees, eq(loans.employeeId, employees.id))
          .where(and(eq(loans.orgId, principal.orgId), eq(loans.status, "active")));
        const total = rows.reduce((a, r) => a + r.l.balance, 0);
        reply = `There are **${rows.length} active loans** with an outstanding balance of ${kes(total)}. Monthly recoveries of ${kes(rows.reduce((a, r) => a + Math.min(r.l.monthlyInstallment, r.l.balance), 0))} are deducted in each payroll run, and every repayment lands in an immutable ledger tied to the run that made it.`;
        table = {
          columns: ["Employee", "Type", "Principal", "Balance", "Monthly Installment"],
          rows: rows.map((r) => [`${r.e.firstName} ${r.e.lastName}`, r.l.type, kes(r.l.principal), kes(r.l.balance), kes(r.l.monthlyInstallment)]),
        };
      }
      /* ---- statutory knowledge (from the LIVE config, not a hardcoded constant) ---- */
      else if (/paye|tax band|shif|nssf|housing levy|ahl|relief|rate/.test(q)) {
        const period = new Date().toISOString().slice(0, 7);
        const { config: c } = await resolveConfig(tx, principal.orgId, principal.countryCode, period);
        const ss = c.socialSecurity;
        const ahl = c.levies.find((l) => l.code === "AHL");
        reply = `Here are the statutory rules in force for ${principal.countryCode} this month, from "**${c.name}**" (effective ${c.effectiveFrom}): **PAYE** is progressive across ${c.payeBands.length} bands; **personal relief** is ${kes(c.personalRelief)}/month and insurance relief is ${(c.insuranceRelief.bps / 100).toFixed(0)}% of premiums capped at ${kes(c.insuranceRelief.cap)}. **${c.health.code}** is ${(c.health.bps / 100).toFixed(2)}% of gross (min ${kes(c.health.minimum)}). **${ss.code}** is ${(ss.employeeBps / 100).toFixed(0)}% each for employer & employee — Tier I on the first ${kes(ss.lowerEarningsLimit)}, Tier II up to ${kes(ss.upperEarningsLimit)}.${ahl ? ` The **Affordable Housing Levy** is ${(ahl.employeeBps / 100).toFixed(1)}% employee + ${(ahl.employerBps / 100).toFixed(1)}% employer.` : ""} Statutory contributions marked tax-deductible are allowable deductions against taxable income.`;
        let prev = 0;
        table = {
          columns: ["Monthly Taxable Band", "Rate"],
          rows: c.payeBands.map((b) => {
            const label = b.upTo === null
              ? `Above ${kes(prev)}`
              : `${kes(prev)} – ${kes(b.upTo)}`;
            prev = b.upTo ?? prev;
            return [label, `${(b.bps / 100).toFixed(1)}%`];
          }),
        };
      }
      /* ---- headcount / departments ---- */
      else if (/headcount|how many employees|gender|ratio|department cost|staff count/.test(q)) {
        const female = staff.filter((s) => s.e.gender === "female").length;
        const byDept: Record<string, { count: number; gross: Cents }> = {};
        staff.forEach((s) => {
          const k = s.d?.name || "Unassigned";
          byDept[k] = byDept[k] || { count: 0, gross: 0 };
          byDept[k].count++;
          byDept[k].gross += grossOf(s.e);
        });
        reply = staff.length === 0
          ? "No active employees yet."
          : `You currently have **${staff.length} active employees** — ${female} female (${((female / staff.length) * 100).toFixed(0)}%) and ${staff.length - female} male. Total monthly gross commitment is ${kes(staff.reduce((a, s) => a + grossOf(s.e), 0))}.`;
        table = {
          columns: ["Department", "Headcount", "Monthly Gross"],
          rows: Object.entries(byDept).map(([k, v]) => [k, v.count, kes(v.gross)]),
        };
      }
      /* ---- top earners ---- */
      else if (/top|highest|best paid/.test(q)) {
        const top = staff.map((s) => ({ s, g: grossOf(s.e) })).sort((a, b) => b.g - a.g).slice(0, 5);
        const totalGross = staff.reduce((a, s) => a + grossOf(s.e), 0);
        reply = `Here are your top ${top.length} earners by gross pay. Together they account for ${kes(top.reduce((a, t) => a + t.g, 0))}${totalGross > 0 ? ` — ${((top.reduce((a, t) => a + t.g, 0) / totalGross) * 100).toFixed(0)}% of total payroll` : ""}.`;
        table = {
          columns: ["Employee", "Position", "Gross Pay"],
          rows: top.map((t) => [`${t.s.e.firstName} ${t.s.e.lastName}`, t.s.e.position, kes(t.g)]),
        };
      } else {
        reply = `I'm **Zawadi AI**, your payroll copilot. I can answer questions in plain English against your live payroll data. Try:\n\n• "Show employees earning above 200,000"\n• "Who has not taken leave?"\n• "Compare payroll this month to last month"\n• "Explain Wanjiku's payslip"\n• "Detect payroll anomalies"\n• "What are the current PAYE bands?"\n• "Show active loans"\n• "Top earners"`;
      }

      const suggestions = [
        "Show employees earning above 200,000",
        "Who has not taken leave?",
        "Compare payroll this month to last month",
        "Detect payroll anomalies",
        "What are the current PAYE tax bands?",
      ];

      return NextResponse.json({ reply, table, suggestions });
    }),
);
