import { Link } from "wouter";
import { ArrowRight } from "lucide-react";

/** The documents the brief lists as statutory exports, nothing more. */
const DOCUMENTS = [
  { name: "KRA P10A", kind: "Return", tag: "KRA" },
  { name: "NSSF return", kind: "Return", tag: "NSSF" },
  { name: "SHIF return", kind: "Return", tag: "SHIF" },
  { name: "Housing Levy return", kind: "Return", tag: "AHL" },
  { name: "P9 certificates", kind: "Annual, one per employee", tag: "KRA" },
  { name: "P10 tax cards", kind: "Tax card", tag: "KRA" },
  { name: "Muster roll", kind: "Employment record", tag: "RECORD" },
];

export function Compliance() {
  return (
    <section id="compliance" className="grid-navy py-24">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid lg:grid-cols-2 gap-14 lg:gap-20 items-start">
          <div>
            <p className="ref-label text-accent mb-5">Statutory</p>
            <h2 className="display-caps text-3xl md:text-5xl leading-[1.02] font-extrabold text-white">
              The paperwork comes out of the run.
            </h2>
            <p className="mt-6 text-lg text-white/80 leading-relaxed max-w-xl">
              Kenya's payroll rules change. Mavuno HR calculates from dated statutory rule sets,
              so each run uses the rules in force for its month, and the returns are produced
              from the same figures as the payslips.
            </p>
            <Link
              href="/compliance"
              className="mt-8 inline-flex items-center gap-2 font-semibold text-accent hover:text-white underline underline-offset-[6px] decoration-1"
            >
              How compliance works <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="border border-[hsl(var(--rule))] bg-[hsl(var(--navy))]">
            <div className="grid grid-cols-[1fr_auto] px-5 py-3 border-b border-[hsl(var(--rule))] font-mono text-[11px] uppercase tracking-[0.08em] text-white/55">
              <span>Document</span>
              <span>Scheme</span>
            </div>
            {DOCUMENTS.map((d) => (
              <div key={d.name} className="grid grid-cols-[1fr_auto] items-center gap-4 px-5 py-3.5 border-b border-[hsl(var(--rule))]/60 last:border-b-0">
                <div className="min-w-0">
                  <span className="block font-semibold text-white">{d.name}</span>
                  <span className="block text-xs text-white/55">{d.kind}</span>
                </div>
                <span className="font-mono text-[11px] font-medium text-accent border border-accent/60 px-2 py-0.5">{d.tag}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
