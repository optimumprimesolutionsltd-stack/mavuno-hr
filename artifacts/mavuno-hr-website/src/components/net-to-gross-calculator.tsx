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
 * "What gross do I put on the contract so they take home X?"
 *
 * There is no closed form for this. PAYE is progressive, and NSSF, SHIF and the
 * Housing Levy all reduce taxable income before it is charged — so the answer
 * is found by search, not algebra. The server does that with solveGrossForNet,
 * the same routine the product uses, for the same reason the other calculator
 * calls out: a second copy of the tax rules in this bundle would drift.
 */

const DEFAULT_NET = "50000";
const DEBOUNCE_MS = 450;

interface Response {
  period: string;
  config: string;
  targetNet: number;
  achievedNet: number;
  result: CalcResult;
}

export function NetToGrossCalculator() {
  const [net, setNet] = useState(DEFAULT_NET);
  const [data, setData] = useState<Response | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Stops a slower earlier response from overwriting a newer one mid-typing.
  const requestId = useRef(0);

  useEffect(() => {
    const raw = net.replace(/,/g, "").trim();
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
        const res = await fetch("/api/public/calculator/net-to-gross", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetNet: raw }),
          signal: controller.signal,
        });
        if (id !== requestId.current) return;

        if (res.status === 429) {
          setError("That is a lot of calculations. Give it a minute and try again.");
          setData(null);
        } else if (res.status === 422) {
          setError("That take-home figure is outside the range this can solve.");
          setData(null);
        } else if (!res.ok) {
          setError("Could not calculate that just now. Please try again.");
          setData(null);
        } else {
          setData((await res.json()) as Response);
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
  }, [net]);

  const r = data?.result;
  // The solver returns the smallest gross whose net clears the target, so the
  // achieved net can land a cent or two above what was asked for. Say so rather
  // than showing a figure that does not match the input and letting the reader
  // wonder whether the tool is wrong.
  const overshoot = data ? data.achievedNet - data.targetNet : 0;

  return (
    <div className="rounded-2xl border border-border bg-white shadow-sm overflow-hidden">
      <div className="p-6 md:p-8 border-b border-border bg-muted/30">
        <label htmlFor="net" className="block text-sm font-semibold text-secondary mb-2">
          Monthly take-home pay
        </label>
        <div className="flex items-center gap-3 max-w-sm">
          <span className="text-muted-foreground font-medium">KES</span>
          <input
            id="net"
            name="net"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={net}
            onChange={(e) => setNet(e.target.value)}
            className="flex-1 rounded-lg border border-border bg-white px-4 py-3 text-lg tabular-nums text-secondary focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
            aria-describedby="net-help"
          />
        </div>
        <p id="net-help" className="text-xs text-muted-foreground mt-2">
          What the employee should receive. Assumes a resident employee on a full
          month, with no pension, HELB or insurance relief.
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
                Working it out…
              </>
            ) : (
              "Enter a take-home figure to see the gross it needs."
            )}
          </div>
        )}

        {r && data && (
          <div className={loading ? "opacity-60 transition-opacity" : "transition-opacity"}>
            <div className="rounded-xl bg-primary/5 border border-primary/20 p-5 mb-8">
              <p className="text-sm text-muted-foreground mb-1">
                Gross salary to put on the contract
              </p>
              <p className="text-3xl font-bold text-secondary tabular-nums">
                KES {money(r.gross)}
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                Pays a net of KES {money(data.achievedNet)}
                {overshoot > 0 && <> — KES {money(overshoot)} above the figure you asked for, because pay cannot land exactly on it</>}
                .
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-x-10 gap-y-6">
              <DeductionsColumn r={r} />
              <div>
                <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-primary mb-3">
                  What it costs the employer
                </h3>
                <EmployerCostRows r={r} />
                <p className="text-sm text-muted-foreground mt-4 leading-relaxed">
                  Budgeting from take-home is how payroll costs get
                  underestimated: the gross is higher than the figure you agreed,
                  and the employer contributions sit on top of that again.
                </p>
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

            <p className="mt-6 text-xs text-muted-foreground border-l-2 border-border pl-3">
              Calculated using {data.config}, the same rules Mavuno HR runs
              payroll on. Figures are an estimate for a resident employee on a
              full month and are not tax advice.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
