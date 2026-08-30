import { Users, FileSpreadsheet, Building2, Smartphone } from "lucide-react";

const capabilities = [
  {
    title: "People Management",
    description: "Maintain a unified directory, store essential documents securely, and track leave balances instantly. Say goodbye to scattered spreadsheets.",
    icon: Users,
    color: "bg-blue-50 text-blue-600 border-blue-100"
  },
  {
    title: "Automated Payroll",
    description: "Execute one-click payroll runs. We automate complex tax calculations, generate accurate payslips, and build reports perfectly formatted for banks.",
    icon: FileSpreadsheet,
    color: "bg-emerald-50 text-emerald-600 border-emerald-100"
  },
  {
    title: "Statutory Compliance",
    description: "Built-in, perfectly accurate calculations for PAYE, NSSF, NHIF, and the Affordable Housing Levy. Always up-to-date with current Kenyan law.",
    icon: Building2,
    color: "bg-indigo-50 text-indigo-600 border-indigo-100"
  },
  {
    title: "Employee Self-Service",
    description: "Empower your team with a mobile-friendly portal to access their payslips, view leave balances, and request time off without bothering HR.",
    icon: Smartphone,
    color: "bg-amber-50 text-amber-600 border-amber-100"
  }
];

export function Features() {
  return (
    <section id="features" className="py-24 bg-white relative">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <h2 className="text-3xl md:text-5xl font-bold text-secondary mb-6 tracking-tight">Everything you need to manage your people</h2>
          <p className="text-lg text-muted-foreground">
            A complete suite of tools designed to remove friction from your daily HR and payroll operations.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {capabilities.map((feature, i) => (
            <div 
              key={i} 
              className="group p-8 rounded-2xl border border-border bg-background hover:shadow-xl hover:border-primary/20 transition-all duration-300"
            >
              <div className={`w-14 h-14 rounded-xl flex items-center justify-center border mb-6 ${feature.color}`}>
                <feature.icon className="h-7 w-7" />
              </div>
              <h3 className="text-2xl font-bold text-secondary mb-3">{feature.title}</h3>
              <p className="text-muted-foreground leading-relaxed text-lg">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
