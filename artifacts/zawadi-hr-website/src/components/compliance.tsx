import { ShieldCheck, Check } from "lucide-react";

export function Compliance() {
  return (
    <section id="compliance" className="py-24 bg-secondary text-white overflow-hidden relative">
      <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-primary via-transparent to-transparent" />
      
      <div className="max-w-7xl mx-auto px-6 relative z-10">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <div>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 text-primary-foreground font-medium text-sm mb-8 border border-white/20">
              <ShieldCheck className="h-5 w-5" />
              KRA & Statutory Updates
            </div>
            <h2 className="text-4xl md:text-5xl font-bold mb-6 tracking-tight">Never miss a compliance update.</h2>
            <p className="text-xl text-white/80 leading-relaxed mb-8">
              Kenya's tax laws change fast. Zawadi HR automatically updates with the latest KRA guidelines, ensuring your PAYE, Housing Levy, and statutory deductions are perfectly calculated every time.
            </p>
            
            <ul className="space-y-4">
              {[
                "Instant P10 and P9 form generation",
                "Automated Housing Levy (AHL) calculations",
                "NSSF & NHIF/SHIF exact tier mapping",
                "Filing-ready formats for KRA iTax"
              ].map((item, i) => (
                <li key={i} className="flex items-center gap-3 text-lg text-white/90">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center">
                    <Check className="h-4 w-4 text-primary" />
                  </div>
                  {item}
                </li>
              ))}
            </ul>
          </div>
          
          <div className="relative">
            <div className="absolute -inset-4 bg-gradient-to-r from-primary to-accent rounded-[2rem] opacity-20 blur-xl" />
            <div className="relative bg-[#112147] border border-white/10 rounded-2xl p-8 shadow-2xl">
              <div className="flex items-center justify-between mb-8 pb-6 border-b border-white/10">
                <div>
                  <div className="text-sm text-white/60 mb-1">Payroll Period</div>
                  <div className="text-xl font-bold">October 2024</div>
                </div>
                <div className="px-3 py-1 rounded bg-emerald-500/20 text-emerald-400 text-sm font-medium">
                  Verified Clean
                </div>
              </div>
              
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <span className="text-white/70">PAYE Deducted</span>
                  <span className="font-mono font-medium">KES 482,450.00</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-white/70">NSSF Contributions</span>
                  <span className="font-mono font-medium">KES 32,400.00</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-white/70">Housing Levy (AHL)</span>
                  <span className="font-mono font-medium">KES 54,200.00</span>
                </div>
              </div>
              
              <div className="mt-8 pt-6 border-t border-white/10">
                <div className="flex justify-between items-center">
                  <span className="font-bold">Total Statutory</span>
                  <span className="font-mono font-bold text-primary">KES 569,050.00</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
