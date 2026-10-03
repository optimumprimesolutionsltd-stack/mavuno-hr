const capabilities = [
  {
    title: "People",
    description: "One directory for every employee, with their documents stored securely and leave balances you can check instantly. No more scattered spreadsheets.",
  },
  {
    title: "Payroll runs",
    description: "Draft, review and approve a run, then generate payslips and the bank and M-Pesa payment files. The tax arithmetic is done for you.",
  },
  {
    title: "Statutory deductions",
    description: "PAYE, NSSF Tier I and II, SHIF and the Affordable Housing Levy, calculated from the current statutory rules for every employee on every run.",
  },
  {
    title: "Employee self-service",
    description: "A mobile-friendly portal where your team gets their payslips, checks leave balances and requests time off without waiting on HR.",
  },
];

export function Features() {
  return (
    <section id="features" className="py-24 bg-background">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid lg:grid-cols-[1fr_2fr] gap-12 lg:gap-20">
          <div>
            <p className="ref-label text-primary mb-5">What it does</p>
            <h2 className="display-caps text-3xl md:text-[2.75rem] leading-[1.02] font-extrabold text-secondary">
              Everything a payroll month needs
            </h2>
            <p className="mt-6 text-lg text-muted-foreground leading-relaxed">
              From the employee record to the filed return, in one system with one audit trail.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 border-t-2 border-secondary">
            {capabilities.map((feature, i) => (
              <div
                key={feature.title}
                className={`py-8 sm:px-8 border-b border-border ${i % 2 === 0 ? "sm:pl-0 sm:border-r" : "sm:pr-0"}`}
              >
                <h3 className="text-xl font-bold text-secondary mb-3">{feature.title}</h3>
                <p className="text-muted-foreground leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
