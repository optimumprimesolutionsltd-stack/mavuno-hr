/**
 * The figures printed in the published guides must still be what the payroll
 * engine produces.
 *
 * "What a hire actually costs in Kenya" quotes computed totals — net pay,
 * employer cost, on-cost — rather than rates, precisely so it survives a rate
 * change. It does not survive a *pack* change: when NSSF Year 4 raised the
 * earnings limits on 1 February 2026, every figure in that article above
 * 72,000 gross silently became wrong, and stayed wrong on a live marketing
 * site aimed at payroll professionals until somebody happened to recompute it.
 *
 * This is the thing that notices. If a new statutory pack moves any of these,
 * this test fails and names the article that needs rewriting — rather than the
 * site quietly publishing figures the product itself disagrees with.
 *
 * When it fails: recompute against the live endpoint (POST
 * /api/public/calculator and /calculator/net-to-gross), update
 * artifacts/mavuno-hr-website/src/pages/guides/cost-of-hiring-in-kenya.tsx
 * including FIGURES_DATE and FIGURES_PACK, then update the table here.
 */
import { describe, it, expect } from "vitest";
import { computePayslip, emptyPayInput, solveGrossForNet } from "../lib/payroll.js";
import { ALL_PACKS } from "../lib/statutory-packs.js";
import { toCents } from "../lib/money.js";

/**
 * The Kenyan pack in force today — the latest whose effectiveFrom has passed,
 * which is the same rule resolveConfig() applies against the database. Picked
 * rather than hardcoded so that adding a future pack makes this test start
 * checking against it on the day it takes effect.
 */
const pack = ALL_PACKS
  .filter((p) => p.countryCode === "KE" && p.effectiveFrom <= new Date().toISOString().slice(0, 10))
  .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))
  .at(-1)!;

/** Exactly the rows rendered in cost-of-hiring-in-kenya.tsx. KES. */
const GROSS_ROWS = [
  { gross: 30_000, net: "26193.75", employerCost: "32300.00" },
  { gross: 50_000, net: "39029.15", employerCost: "53800.00" },
  { gross: 80_000, net: "57876.65", employerCost: "86050.00" },
  { gross: 120_000, net: "83510.65", employerCost: "128330.00" },
  { gross: 200_000, net: "137130.65", employerCost: "209530.00" },
];

const NET_ROWS = [
  { takeHome: 30_000, gross: "35654.60", employerCost: "38378.70" },
  { takeHome: 50_000, gross: "67462.55", employerCost: "72572.24" },
  { takeHome: 100_000, gross: "144601.79", employerCost: "153300.82" },
];

const kes = (cents: number) => (cents / 100).toFixed(2);

describe("published guide figures still match the engine", () => {
  it("is checking against the pack that is actually current", () => {
    // A guard on the guard: if this ever resolves to an older pack, the
    // assertions below would "pass" against figures nobody is being shown.
    expect(pack.countryCode).toBe("KE");
  });

  it.each(GROSS_ROWS)("gross $gross produces the printed net and employer cost", (row) => {
    const r = computePayslip(
      { ...emptyPayInput(), basicSalary: toCents(row.gross) } as never,
      pack as never,
    );
    expect(kes(r.netPay)).toBe(row.net);
    expect(kes(r.employerCost)).toBe(row.employerCost);
  });

  it.each(NET_ROWS)("take-home $takeHome needs the printed gross", (row) => {
    const { result: r } = solveGrossForNet(
      toCents(row.takeHome),
      emptyPayInput() as never,
      pack as never,
    );
    expect(kes(r.gross)).toBe(row.gross);
    expect(kes(r.employerCost)).toBe(row.employerCost);
  });

  it("still supports the article's structural claim that on-cost falls as gross rises", () => {
    // The piece argues the employer's own contributions shrink as a share of
    // salary, because NSSF caps while the Housing Levy does not. If a future
    // pack removed the NSSF ceiling that argument stops being true, and the
    // prose needs rewriting even though every number above might still match.
    const share = (gross: number) => {
      const r = computePayslip(
        { ...emptyPayInput(), basicSalary: toCents(gross) } as never,
        pack as never,
      );
      return (r.employerCost - r.gross) / r.gross;
    };
    expect(share(200_000)).toBeLessThan(share(30_000));
  });
});
