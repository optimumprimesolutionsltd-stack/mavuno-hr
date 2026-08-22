import { Button } from "./ui/button";
import { ArrowRight, ArrowLeftRight, Database } from "lucide-react";
import markSvg from "@assets/branding/zawadi-mark.svg";

export function TallyIntegration() {
  return (
    <section id="tally" className="py-24 bg-white">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          
          <div className="order-2 lg:order-1 flex justify-center">
            <div className="relative w-full max-w-md">
              {/* Abstract integration diagram */}
              <div className="flex items-center justify-between">
                <div className="w-24 h-24 rounded-2xl bg-white border border-border shadow-xl flex items-center justify-center p-4 z-10 relative">
                  <img src={markSvg} alt="Mavuno HR" className="w-full h-full object-contain" />
                </div>
                
                <div className="flex-1 flex flex-col items-center relative">
                  <div className="w-full h-1 border-t-2 border-dashed border-primary/40" />
                  <div className="absolute top-1/2 -translate-y-1/2 bg-white px-3 text-primary font-medium text-sm flex items-center gap-2 border border-primary/20 rounded-full shadow-sm py-1">
                    <ArrowLeftRight className="h-4 w-4" />
                    Auto-Sync
                  </div>
                </div>

                <div className="w-24 h-24 rounded-2xl bg-[#FFE494]/10 border border-[#FFE494]/50 shadow-xl flex items-center justify-center p-4 z-10 relative overflow-hidden">
                  <div className="text-2xl font-black text-[#FFB100] tracking-tighter">Tally</div>
                </div>
              </div>

              <div className="mt-12 bg-gray-50 border border-border rounded-xl p-6 shadow-sm">
                <div className="flex items-center gap-3 mb-4 text-sm font-medium text-secondary">
                  <Database className="h-5 w-5 text-muted-foreground" />
                  Sync Status: Real-time
                </div>
                <div className="space-y-3">
                  <div className="h-2 w-full bg-gray-200 rounded overflow-hidden">
                    <div className="h-full bg-primary w-3/4 rounded" />
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Journal Entries Exported</span>
                    <span>Just now</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="order-1 lg:order-2">
            <h2 className="text-4xl md:text-5xl font-bold text-secondary mb-6 tracking-tight">Plays nicely with Tally.</h2>
            <p className="text-xl text-muted-foreground leading-relaxed mb-8">
              Already using Tally for accounting? Mavuno HR bridges the gap. Sync payroll data directly to Tally ERP 9 and TallyPrime. No manual journal entries, no reconciliation headaches. Just smooth, automated syncing.
            </p>
            <p className="text-lg text-secondary font-medium mb-8">
              Don't use Tally? No problem. Mavuno HR works perfectly as a standalone, powerful HR platform.
            </p>
            <Button variant="outline" size="lg" className="group text-secondary">
              See Integration Details
              <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
            </Button>
          </div>

        </div>
      </div>
    </section>
  );
}
