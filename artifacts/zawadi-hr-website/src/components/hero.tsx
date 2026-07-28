import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { ArrowRight, CheckCircle2 } from "lucide-react";

export function Hero() {
  return (
    <section className="relative pt-32 pb-20 md:pt-48 md:pb-32 overflow-hidden">
      {/* Background decoration */}
      <div className="absolute top-0 right-0 -translate-y-12 translate-x-1/3 w-[800px] h-[800px] rounded-full bg-primary/5 blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 translate-y-1/3 -translate-x-1/3 w-[600px] h-[600px] rounded-full bg-secondary/5 blur-3xl pointer-events-none" />

      <div className="max-w-7xl mx-auto px-6 relative z-10">
        <div className="max-w-3xl">
          <Badge className="mb-6">Modern HR & Payroll for Kenya</Badge>
          <h1 className="text-5xl md:text-7xl font-extrabold text-secondary tracking-tight leading-[1.1] mb-8">
            Run payroll with absolute <span className="text-primary">confidence.</span>
          </h1>
          <p className="text-xl md:text-2xl text-muted-foreground leading-relaxed mb-10 max-w-2xl font-medium">
             zawadiHR handles complex KRA compliance, automated payroll, and leave management, so you can focus on building your team. Independent, secure, and built for modern Kenyan businesses.
          </p>
          
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <Button size="lg" className="w-full sm:w-auto group" asChild>
              <a href="#demo">
                Request Early Access
                <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </a>
            </Button>
            <Button size="lg" variant="outline" className="w-full sm:w-auto" asChild>
              <a href="#features">Explore Features</a>
            </Button>
          </div>

          <div className="mt-12 flex items-center gap-6 text-sm font-medium text-muted-foreground">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              <span>KRA Compliant</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              <span>Self-Service Portal</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              <span>Tally Ready</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
