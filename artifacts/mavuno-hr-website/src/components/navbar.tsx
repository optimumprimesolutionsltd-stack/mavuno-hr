import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Menu, X } from "lucide-react";
import logoSvg from "@assets/branding/mavuno-hr-wordmark.svg";

const LINKS = [
  { href: "/features", label: "Features" },
  { href: "/compliance", label: "Compliance" },
  { href: "/paye-calculator", label: "PAYE calculator" },
  { href: "/pricing", label: "Pricing" },
];

export function Navbar() {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);

  // A link tap navigates without unmounting the navbar, so close on arrival.
  useEffect(() => setOpen(false), [location]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

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
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            className="md:hidden -mr-2 h-10 w-10 grid place-items-center rounded-[2px] text-secondary hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {/* Same drafting grid as the page heroes, dropped under the bar. */}
      {open && (
        <div id="mobile-menu" className="md:hidden grid-navy border-t-2 border-secondary border-b-4 border-b-accent shadow-[0_12px_24px_rgb(0_0_0/0.35)]">
          <ul className="px-6 py-2">
            {LINKS.map((link) => {
              const active = location === link.href;
              return (
                <li key={link.href} className="border-b border-[hsl(var(--rule))] last:border-b-0">
                  <Link
                    href={link.href}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center justify-between py-4 display-caps text-xl font-extrabold ${
                      active ? "text-accent" : "text-white"
                    }`}
                  >
                    {link.label}
                    {active && <span aria-hidden="true" className="font-mono text-[11px] font-medium tracking-[0.08em] text-accent">YOU ARE HERE</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="px-6 pb-6 pt-2 sm:hidden">
            <a
              href="/app/"
              className="flex h-12 items-center justify-center rounded-[2px] border border-[hsl(var(--rule))] text-white font-semibold hover:border-white"
            >
              Sign in
            </a>
          </div>
        </div>
      )}
    </nav>
  );
}
