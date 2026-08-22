import logoSvg from "@assets/branding/zawadi-hr-logo.svg";

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-white border-t border-border pt-16 pb-8">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">
          <div className="md:col-span-1">
            <img src={logoSvg} alt="Mizani HR" className="h-8 w-auto mb-6" />
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
              <li><a href="#features" className="hover:text-primary transition-colors">Features</a></li>
              <li><a href="#compliance" className="hover:text-primary transition-colors">Compliance</a></li>
              <li><a href="#tally" className="hover:text-primary transition-colors">Tally Integration</a></li>
              <li><a href="#" className="hover:text-primary transition-colors">Pricing</a></li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-semibold text-secondary mb-4">Resources</h4>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li><a href="#" className="hover:text-primary transition-colors">Help Center</a></li>
              <li><a href="#" className="hover:text-primary transition-colors">API Documentation</a></li>
              <li><a href="#" className="hover:text-primary transition-colors">KRA Tax Guide</a></li>
              <li><a href="#" className="hover:text-primary transition-colors">Blog</a></li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-secondary mb-4">Legal</h4>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li><a href="#" className="hover:text-primary transition-colors">Privacy Policy</a></li>
              <li><a href="#" className="hover:text-primary transition-colors">Terms of Service</a></li>
              <li><a href="#" className="hover:text-primary transition-colors">Security</a></li>
            </ul>
          </div>
        </div>
        
        <div className="pt-8 border-t border-border flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <p>© {currentYear} Mizani HR. All rights reserved.</p>
          <div className="flex items-center gap-6">
            <a href="https://app.zawadihr.com/login" className="hover:text-primary transition-colors font-medium">Sign In to Dashboard</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
