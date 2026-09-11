import { useEffect, useRef, useState } from "react";
import { Loader2, AlertCircle } from "lucide-react";

/**
 * Calls POST /api/public/calculator rather than doing the arithmetic here.
 *
 * The tax bands, NSSF tiers, SHIF rate and Housing Levy live in one place —
 * the statutory packs the product itself runs payroll on — and a second copy
 * compiled into this bundle would drift away from them silently. The whole
 * pitch of this page is that the numbers are current, so it has to ask the
 * thing that actually knows.
 *
 * Server-rendered with DEFAULT_GROSS already in the box and no result yet, so
 * the markup is identical on both sides of hydration; the first calculation
 * fires from an effect once the browser takes over.
 */

const DEFAULT_GROSS = "100000";
const DEBOUNCE_MS = 450;

interface Band {
  band: string;
  amount: number;
  bps: number;
  tax: number;
}

interface CalcResult {
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

interface CalcResponse {
  period: string;
  config: string;
  result: CalcResult;
}

/** Cents to "12,345.67". Amounts here are monthly salaries, so no compaction. */
function money(cents: number): string {
  return (cents / 100).toLocaleString("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function Row({
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

export function PayeCalculator() {
  const [gross, setGross] = useState(DEFAULT_GROSS);
  const [data, setData] = useState<CalcResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Guards against an earlier, slower response overwriting a later one when
  // someone types quickly.
  const requestId = useRef(0);

  useEffect(() => {
    const raw = gross.replace(/,/g, "").trim();
    if (!raw || !/^\d{1,9}(\.\d{1,2})?$/.test(raw)) {
      setData(null);
      setError(raw ? "Enter a monthly amount in shillings, digits only." : null);
      setLoading(false);
      return;
    }

    setError(null);
    setLoading(true);
    const id = ++requestId.current;
    const controller = new AbortController();

    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/public/calculator", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ grossSalary: raw }),
          signal: controller.signal,
        });
        if (id !== requestId.current) return;

        if (res.status === 429) {
          setError("That is a lot of calculations. Give it a minute and try again.");
          setData(null);
        } else if (!res.ok) {
          setError("Could not calculate that just now. Please try again.");
          setData(null);
        } else {
          setData((await res.json()) as CalcResponse);
        }
      } catch (err) {
        if ((err as Error).name === "AbortError" || id !== requestId.current) return;
        setError("Could not reach the calculator. Check your connection and try again.");
        setData(null);
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [gross]);

  const r = data?.result;

  return (
    <div className="rounded-2xl border border-border bg-white shadow-sm overflow-hidden">
      <div className="p-6 md:p-8 border-b border-border bg-muted/30">
        <label htmlFor="gross" className="block text-sm font-semibold text-secondary mb-2">
          Monthly gross salary
        </label>
        <div className="flex items-center gap-3 max-w-sm">
          <span className="text-muted-foreground font-medium">KES</span>
          <input
            id="gross"
            name="gross"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={gross}
            onChange={(e) => setGross(e.target.value)}
            className="flex-1 rounded-lg border border-border bg-white px-4 py-3 text-lg tabular-nums text-secondary focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
            aria-describedby="gross-help"
          />
        </div>
        <p id="gross-help" className="text-xs text-muted-foreground mt-2">
          Assumes a resident employee on a full month, with no pension, HELB or
          insurance relief.
        </p>
      </div>

      <div className="p-6 md:p-8" aria-live="polite" aria-busy={loading}>
        {error && (
          <div className="flex items-start gap-2 text-sm text-destructive mb-4">
            <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {!r && !error && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Calculating…
              </>
            ) : (
              "Enter a salary to see the breakdown."
            )}
          </div>
        )}

        {r && (
          <div className={loading ? "opacity-60 transition-opacity" : "transition-opacity"}>
            <div className="grid md:grid-cols-2 gap-x-10 gap-y-6">
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

              <div>
                <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-primary mb-3">
                  Take-home
                </h3>
                <div className="rounded-xl bg-primary/5 border border-primary/20 p-5 mb-5">
                  <p className="text-sm text-muted-foreground mb-1">Net pay per month</p>
                  <p className="text-3xl font-bold text-secondary tabular-nums">
                    KES {money(r.netPay)}
                  </p>
                </div>

                <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-primary mb-3">
                  What it costs the employer
                </h3>
                <Row label="Gross pay" value={money(r.gross)} />
                <Row label="NSSF employer" value={`+ ${money(r.nssfEmployer)}`} />
                <Row label="Housing Levy employer" value={`+ ${money(r.housingLevyEmployer)}`} />
                <Row label="Total cost" value={money(r.employerCost)} strong />
              </div>
            </div>

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

            {r.warnings.length > 0 && (
              <ul className="mt-4 text-xs text-muted-foreground space-y-1">
                {r.warnings.map((w) => (
                  <li key={w}>· {w}</li>
                ))}
              </ul>
            )}

            {data && (
              <p className="mt-6 text-xs text-muted-foreground border-l-2 border-border pl-3">
                Calculated using {data.config}, the same rules Mavuno HR runs
                payroll on. Figures are an estimate for a resident employee on a
                full month and are not tax advice.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
