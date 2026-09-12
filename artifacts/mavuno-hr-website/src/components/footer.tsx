import { Link } from "wouter";
import logoSvg from "@assets/branding/mavuno-hr-wordmark.svg";

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-white border-t border-border pt-16 pb-8">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-12 mb-16">
          <div className="md:col-span-1">
            <img src={logoSvg} alt="Mavuno HR" className="h-8 w-auto mb-3" />
            <p className="mb-6 text-xs font-bold uppercase tracking-[0.22em] text-secondary/70">
              People <span className="text-[#E2A62B]">·</span> Payroll <span className="text-[#E2A62B]">·</span> Performance
            </p>
            <p className="text-muted-foreground text-sm leading-relaxed mb-6">
              Independent, secure payroll and people management built specifically for modern Kenyan businesses.
            </p>
            <div className="text-xs text-muted-foreground/60 font-medium">
              Built for Kenyan businesses
            </div>
          </div>

          <div>
            <h4 className="font-semibold text-secondary mb-4">Product</h4>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li><Link href="/features" className="hover:text-primary transition-colors">Features</Link></li>
              <li><Link href="/compliance" className="hover:text-primary transition-colors">Compliance</Link></li>
              <li><Link href="/pricing" className="hover:text-primary transition-colors">Pricing</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-secondary mb-4">Resources</h4>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li><Link href="/paye-calculator" className="hover:text-primary transition-colors">PAYE Calculator</Link></li>
              <li><Link href="/net-to-gross-calculator" className="hover:text-primary transition-colors">Net to Gross Calculator</Link></li>
              <li><Link href="/guides" className="hover:text-primary transition-colors">Guides</Link></li>
              <li><Link href="/compliance" className="hover:text-primary transition-colors">Statutory Compliance</Link></li>
              <li><a href="mailto:info@mavunohr.co.ke" className="hover:text-primary transition-colors">Contact Support</a></li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-secondary mb-4">Legal</h4>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li><Link href="/privacy" className="hover:text-primary transition-colors">Privacy Policy</Link></li>
              <li><Link href="/terms" className="hover:text-primary transition-colors">Terms of Service</Link></li>
              <li><Link href="/security" className="hover:text-primary transition-colors">Security</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-secondary mb-4">Contact</h4>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li>
                <a href="mailto:info@mavunohr.co.ke" className="hover:text-primary transition-colors">
                  info@mavunohr.co.ke
                </a>
              </li>
              <li>Nairobi, Kenya</li>
            </ul>
          </div>
        </div>
        
        <div className="pt-8 border-t border-border flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
            <p>© {currentYear} Mavuno HR. All rights reserved.</p>
          <div className="flex items-center gap-6">
            <a href="/app/" className="hover:text-primary transition-colors font-medium">Sign In to Dashboard</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
