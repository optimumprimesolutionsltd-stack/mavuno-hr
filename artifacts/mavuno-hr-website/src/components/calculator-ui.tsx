/**
 * Shared between the gross-to-net and net-to-gross calculators.
 *
 * Extracted rather than copied: two calculators formatting money differently,
 * or disagreeing about where a row's hint sits, is the kind of drift nobody
 * notices until a screenshot of one is compared with a screenshot of the other.
 */

/** Cents to "12,345.67". Amounts here are monthly salaries, so no compaction. */
export function money(cents: number): string {
  return (cents / 100).toLocaleString("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export interface Band {
  band: string;
  amount: number;
  bps: number;
  tax: number;
}

/** The statutory figures both calculators display, as returned by /api/public. */
export interface CalcResult {
  gross: number;
  taxableIncome: number;
  payeBeforeRelief: number;
  personalRelief: number;
  paye: number;
  nssfEmployee: number;
  shif: number;
  housingLevyEmployee: number;
  totalDeductions: number;
  netPay: number;
  employerCost: number;
  nssfEmployer: number;
  housingLevyEmployer: number;
  bands: Band[];
  warnings: string[];
}

export function Row({
  label,
  value,
  hint,
  strong,
}: {
  label: string;
  value: string;
  hint?: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5 border-b border-border/60 last:border-0">
      <div>
        <span className={strong ? "font-semibold text-secondary" : "text-muted-foreground"}>
          {label}
        </span>
        {hint && <span className="block text-xs text-muted-foreground/70 mt-0.5">{hint}</span>}
      </div>
      <span
        className={`tabular-nums whitespace-nowrap ${
          strong ? "font-semibold text-secondary" : "text-secondary"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

/**
 * The PAYE working, shown identically by both calculators. Collapsed by
 * default — it is the detail that builds trust when someone goes looking for
 * it, not something to lead with.
 */
export function PayeWorking({ r }: { r: CalcResult }) {
  return (
    <details className="mt-8 group">
      <summary className="cursor-pointer text-sm font-medium text-primary hover:underline">
        Show how the PAYE was worked out
      </summary>
      <div className="mt-4 rounded-xl border border-border p-5 bg-muted/20">
        <Row label="Taxable income" value={money(r.taxableIncome)} />
        {r.bands.map((b) => (
          <Row
            key={b.band}
            label={`KES ${b.band} at ${(b.bps / 100).toFixed(b.bps % 100 ? 2 : 0)}%`}
            value={money(b.tax)}
            hint={`on ${money(b.amount)}`}
          />
        ))}
        <Row label="PAYE before relief" value={money(r.payeBeforeRelief)} />
        <Row label="Personal relief" value={`− ${money(r.personalRelief)}`} />
        <Row label="PAYE payable" value={money(r.paye)} strong />
      </div>
    </details>
  );
}

/** The deductions column, identical on both pages. */
export function DeductionsColumn({ r }: { r: CalcResult }) {
  return (
    <div>
      <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-primary mb-3">
        Deductions
      </h3>
      <Row label="Gross pay" value={money(r.gross)} />
      <Row label="PAYE" value={`− ${money(r.paye)}`} hint="After personal relief" />
      <Row label="NSSF" value={`− ${money(r.nssfEmployee)}`} hint="Tier I and Tier II" />
      <Row label="SHIF" value={`− ${money(r.shif)}`} />
      <Row label="Housing Levy" value={`− ${money(r.housingLevyEmployee)}`} />
      <Row label="Total deductions" value={`− ${money(r.totalDeductions)}`} strong />
    </div>
  );
}

/**
 * Employer cost. NOT just the Housing Levy: computePayslip sums the employer
 * side of every levy in the statutory pack into housingLevyEmployer, which
 * today means the Housing Levy plus NITA's flat charge per employee. Labelling
 * it "Housing Levy" would be off by the NITA amount.
 */
export function EmployerCostRows({ r }: { r: CalcResult }) {
  return (
    <>
      <Row label="Gross pay" value={money(r.gross)} />
      <Row label="NSSF employer" value={`+ ${money(r.nssfEmployer)}`} />
      <Row
        label="Employer levies"
        value={`+ ${money(r.housingLevyEmployer)}`}
        hint="Housing Levy and NITA"
      />
      <Row label="Total cost" value={money(r.employerCost)} strong />
    </>
  );
}
