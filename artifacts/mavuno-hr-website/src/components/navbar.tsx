import { Link } from "wouter";
import logoSvg from "@assets/branding/mavuno-hr-logo.svg";
import { Button } from "./ui/button";

export function Navbar() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-lg border-b border-border/50">
      <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 group">
          <img src={logoSvg} alt="Mavuno HR" className="h-8 w-auto group-hover:opacity-90 transition-opacity" />
        </Link>

        <div className="hidden md:flex items-center gap-8 text-sm font-medium text-secondary">
          <a href="#features" className="hover:text-primary transition-colors">Features</a>
          <a href="#compliance" className="hover:text-primary transition-colors">Compliance</a>
          <a href="#tally" className="hover:text-primary transition-colors">Integrations</a>
        </div>

        <div className="flex items-center gap-4">
          <Button variant="ghost" className="hidden sm:inline-flex" asChild>
            <a href="https://app.mavunohr.co.ke/login" target="_blank" rel="noopener noreferrer">Log In</a>
          </Button>
          <Button asChild>
            <a href="#demo">Request Demo</a>
          </Button>
        </div>
      </div>
    </nav>
  );
}
