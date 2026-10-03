import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Link } from "wouter";
import { money, type CalcResult } from "./calculator-ui";

/**
 * The hero is a payslip, because a payslip is what the buyer is trusting us
 * with. Its deductions come from POST /api/public/calculator, the same
 * statutory packs payroll runs on, so the page can never quote a rate that
 * has since changed. Server-rendered with the figures blank; they fill in
 * once the browser takes over, as on the PAYE calculator page.
 */

const BASIC = 78_000;
const HOUSE = 7_000;
const GROSS = BASIC + HOUSE;

interface CalcResponse {
  config: string;
  result: CalcResult;
}

const STEPS = [
  { word: "Run", detail: "Draft, review and approve the month's payroll" },
  { word: "Pay", detail: "Payslips for every employee, bank and M-Pesa files" },
  { word: "File", detail: "P10A, NSSF, SHIF and Housing Levy returns" },
];

export function Hero() {
  const [calc, setCalc] = useState<CalcResponse | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/public/calculator", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grossSalary: String(GROSS) }),
      signal: controller.signal,
    })
      .then((res) => (res.ok ? (res.json() as Promise<CalcResponse>) : null))
      .then((data) => data && setCalc(data))
      .catch(() => {});
    return () => controller.abort();
  }, []);

  const r = calc?.result;
  const fig = (cents: number | undefined) => (cents === undefined ? "—" : money(cents));
  const deduction = (cents: number | undefined) => (cents === undefined ? "—" : `(${money(cents)})`);

  return (
    <section className="grid-navy pt-32 pb-20 md:pt-40 md:pb-28">
      <div className="max-w-7xl mx-auto px-6 grid lg:grid-cols-[1.05fr_1fr] gap-14 lg:gap-16 items-start">
        <div className="min-w-0">
          <p className="ref-label text-accent mb-7">PAYE · NSSF · SHIF · AHL · P10A · P9</p>
          <h1 className="display-caps text-[2.5rem] leading-[0.98] sm:text-6xl lg:text-[4.25rem] font-extrabold text-white">
            Every line on the payslip, accounted for.
          </h1>
          <p className="mt-7 text-lg md:text-xl text-white/80 leading-relaxed max-w-xl">
            Mavuno HR runs Kenyan payroll from approval to payslip, with your KRA, NSSF, SHIF
            and Housing Levy returns ready when the run closes. Every action leaves an audit trail.
          </p>

          <div className="mt-9 flex flex-col sm:flex-row gap-3">
            <a
              href="/app/register"
              className="inline-flex h-14 items-center justify-center gap-2 px-7 rounded-[2px] bg-accent text-accent-foreground font-semibold hover:bg-white transition-colors"
            >
              Start 30-day free trial <ArrowRight className="h-5 w-5" />
            </a>
            <Link
              href="/paye-calculator"
              className="inline-flex h-14 items-center justify-center px-7 rounded-[2px] border border-[hsl(var(--rule))] bg-[hsl(var(--navy))] text-white font-semibold hover:border-white transition-colors"
            >
              Open the PAYE calculator
            </Link>
          </div>

          <ol className="mt-12 grid grid-cols-3 border-t border-[hsl(var(--rule))] max-w-xl">
            {STEPS.map((s) => (
              <li key={s.word} className="pt-4 pr-4">
                <span className="block font-mono text-xl text-white">{s.word}</span>
                <span className="block mt-1 text-xs leading-snug text-white/60">{s.detail}</span>
              </li>
            ))}
          </ol>
        </div>

        <figure
          className="min-w-0 bg-[hsl(var(--background))] text-secondary shadow-[14px_14px_0_hsl(var(--accent)/0.28)] ring-1 ring-black/10"
          aria-label="Example payslip"
        >
          <header className="flex flex-wrap items-start justify-between gap-3 px-5 py-4 border-b-2 border-secondary">
            <span className="display-caps text-[15px] font-extrabold">Payslip · Example</span>
            <span className="font-mono text-xs text-muted-foreground text-right leading-relaxed">
              EMP-0142 · Resident employee<br />Full month, no pension or reliefs
            </span>
          </header>
          <table className="w-full font-mono text-[13.5px] tabular-nums">
            <tbody>
              <SlipGroup>Earnings</SlipGroup>
              <SlipRow label="Basic salary" value={money(BASIC * 100)} />
              <SlipRow label="House allowance" value={money(HOUSE * 100)} />
              <SlipRow label="Gross pay" value={money(GROSS * 100)} strong />
              <SlipGroup>Statutory deductions</SlipGroup>
              <SlipRow label="PAYE" tag="KRA" value={deduction(r?.paye)} />
              <SlipRow label="NSSF Tier I + II" tag="NSSF" value={deduction(r?.nssfEmployee)} />
              <SlipRow label="SHIF" tag="SHIF" value={deduction(r?.shif)} />
              <SlipRow label="Housing Levy" tag="AHL" value={deduction(r?.housingLevyEmployee)} />
              <tr className="border-t-2 border-secondary">
                <td className="px-5 py-4 font-semibold text-base">Net pay</td>
                <td className="px-5 py-4 text-right font-semibold text-lg text-primary whitespace-nowrap">KES {fig(r?.netPay)}</td>
              </tr>
            </tbody>
          </table>
          <figcaption className="px-5 pb-4 text-[11px] leading-relaxed text-muted-foreground">
            {calc
              ? `Calculated just now using ${calc.config}, the same rules payroll runs on.`
              : "Deductions are calculated by the payroll engine when the page loads."}
          </figcaption>
        </figure>
      </div>
    </section>
  );
}

function SlipGroup({ children }: { children: string }) {
  return (
    <tr>
      <td colSpan={2} className="px-5 py-2 bg-muted font-sans text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {children}
      </td>
    </tr>
  );
}

function SlipRow({ label, value, tag, strong }: { label: string; value: string; tag?: string; strong?: boolean }) {
  return (
    <tr className="border-b border-border/70">
      <td className={`px-5 py-2.5 ${strong ? "font-semibold" : ""}`}>
        {label}
        {tag && (
          <span className="ml-2 align-middle font-sans text-[10px] font-semibold tracking-wide text-primary border border-primary px-1.5 py-px">
            {tag}
          </span>
        )}
      </td>
      <td className={`px-5 py-2.5 text-right whitespace-nowrap ${strong ? "font-semibold" : ""}`}>{value}</td>
    </tr>
  );
}
