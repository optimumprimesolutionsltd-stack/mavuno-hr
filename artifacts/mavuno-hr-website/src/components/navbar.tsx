import { Link, useLocation } from "wouter";
import logoSvg from "@assets/branding/mavuno-hr-wordmark.svg";

const LINKS = [
  { href: "/features", label: "Features" },
  { href: "/compliance", label: "Compliance" },
  { href: "/paye-calculator", label: "PAYE calculator" },
  { href: "/pricing", label: "Pricing" },
];

export function Navbar() {
  const [location] = useLocation();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background border-b-2 border-secondary">
      <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between gap-6">
        <Link href="/" className="flex items-center shrink-0">
          <img src={logoSvg} alt="Mavuno HR" className="h-8 w-auto" />
        </Link>

        <div className="hidden md:flex items-stretch h-full">
          {LINKS.map((link) => {
            const active = location === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center px-4 font-display text-[13px] font-semibold uppercase tracking-[0.06em] border-b-[3px] -mb-[2px] transition-colors ${
                  active ? "border-primary text-secondary" : "border-transparent text-secondary/70 hover:text-secondary hover:border-secondary/30"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </div>

        {/* The top-right corner is for the two things a visitor does with their
            own account: start one, or get back into it. Booking a demo is a
            slower path that ends in a conversation rather than a login, so it
            lives at the foot of the page — offered to someone who has read
            everything and still wants to talk to a person, instead of
            competing with Sign Up in the loudest position on the page. */}
        <div className="flex items-center gap-2">
          <a href="/app/" className="hidden sm:inline-flex h-10 items-center px-4 text-sm font-semibold text-secondary hover:underline underline-offset-4">
            Sign in
          </a>
          <a href="/app/register" className="inline-flex h-10 items-center px-5 rounded-[2px] bg-secondary text-secondary-foreground text-sm font-semibold hover:bg-primary transition-colors">
            Start trial
          </a>
        </div>
      </div>
    </nav>
  );
}
