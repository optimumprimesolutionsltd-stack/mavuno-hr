import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@workspace/db";
import { organizations } from "@workspace/db/schema";
import { HttpError } from "./http-error.js";

export const LOAN_TYPES = ["company", "sacco", "advance", "emergency"] as const;
export type LoanType = (typeof LOAN_TYPES)[number];
export type LoanConfig = Record<LoanType, { enabled: boolean; maxMonths: number }>;

const LABELS: Record<LoanType, string> = {
  company: "Company loans", sacco: "SACCO loans", advance: "Salary advances", emergency: "Emergency advances",
};

export const loanConfigSchema = z.object(
  Object.fromEntries(LOAN_TYPES.map((t) => [t, z.object({
    enabled: z.boolean(),
    maxMonths: z.number().int().min(1).max(60),
  })])) as Record<LoanType, z.ZodObject<{ enabled: z.ZodBoolean; maxMonths: z.ZodNumber }>>,
);

export function normalizeLoanConfig(raw: unknown): LoanConfig {
  const src = (raw && typeof raw === "object" ? raw : {}) as Record<string, any>;
  const out = {} as LoanConfig;
  for (const t of LOAN_TYPES) {
    const v = src[t];
    out[t] = {
      enabled: v?.enabled !== false,
      maxMonths: Number.isInteger(v?.maxMonths) && v.maxMonths >= 1 && v.maxMonths <= 60 ? v.maxMonths : 60,
    };
  }
  return out;
}

export async function getLoanConfig(orgId: number): Promise<LoanConfig> {
  const [org] = await db.select({ c: organizations.loanConfig }).from(organizations).where(eq(organizations.id, orgId));
  return normalizeLoanConfig(org?.c);
}

/** Throws 422 unless the company offers this loan type for this many months. */
export async function assertLoanAllowed(orgId: number, type: string, months: number): Promise<void> {
  const cfg = await getLoanConfig(orgId);
  const c = cfg[type as LoanType];
  if (!c) return;
  if (!c.enabled) throw new HttpError(422, `${LABELS[type as LoanType]} are not offered by your company.`, "LOAN_TYPE_DISABLED");
  if (months > c.maxMonths) {
    throw new HttpError(422, `${LABELS[type as LoanType]} can be repaid over at most ${c.maxMonths} month(s).`, "LOAN_TERM_TOO_LONG");
  }
}
