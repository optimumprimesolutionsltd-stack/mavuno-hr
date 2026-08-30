import { Button } from "./ui/button";
import { Input } from "./ui/input";

export function Cta() {
  return (
    <section id="demo" className="py-32 bg-background relative overflow-hidden">
      <div className="absolute inset-0 bg-primary/5" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full bg-primary/10 blur-3xl pointer-events-none" />

      <div className="max-w-4xl mx-auto px-6 relative z-10 text-center">
        <h2 className="text-5xl md:text-6xl font-extrabold text-secondary mb-6 tracking-tight">
          Ready to modernize your HR?
        </h2>
        <p className="text-xl text-muted-foreground mb-12 max-w-2xl mx-auto">
            Join the growing number of Kenyan businesses trusting Mavuno HR for accurate payroll, confident compliance, and happier employees.
        </p>

        <form className="max-w-md mx-auto bg-white p-2 rounded-2xl shadow-xl border border-border flex flex-col sm:flex-row gap-2" onSubmit={(e) => e.preventDefault()}>
          <Input 
            type="email" 
            placeholder="Work email address" 
            className="border-0 focus-visible:ring-0 shadow-none text-base h-14 px-6"
            required
          />
          <Button type="submit" size="lg" className="h-14 px-8 text-base shrink-0">
            Request Demo
          </Button>
        </form>
        
        <p className="mt-6 text-sm text-muted-foreground">
          No credit card required. Fast, free onboarding setup.
        </p>
      </div>
    </section>
  );
}
