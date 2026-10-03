import { useEffect, useRef, useState } from "react";
import { Loader2, AlertCircle } from "lucide-react";
import {
  money,
  Row,
  PayeWorking,
  DeductionsColumn,
  EmployerCostRows,
  type CalcResult,
} from "./calculator-ui";

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

interface CalcResponse {
  period: string;
  config: string;
  result: CalcResult;
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
    <div className="rounded-[2px] border border-border bg-card overflow-hidden">
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
            className="flex-1 rounded-[2px] border border-border bg-card px-4 py-3 text-lg tabular-nums text-secondary focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
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
              <DeductionsColumn r={r} />

              <div>
                <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-primary mb-3">
                  Take-home
                </h3>
                <div className="rounded-[2px] bg-primary/5 border border-primary/20 p-5 mb-5">
                  <p className="text-sm text-muted-foreground mb-1">Net pay per month</p>
                  <p className="text-3xl font-bold text-secondary tabular-nums">
                    KES {money(r.netPay)}
                  </p>
                </div>

                <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-primary mb-3">
                  What it costs the employer
                </h3>
                <EmployerCostRows r={r} />
              </div>
            </div>

            <PayeWorking r={r} />

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
