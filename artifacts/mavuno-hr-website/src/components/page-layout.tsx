import type { ReactNode } from "react";
import { Navbar } from "./navbar";
import { Footer } from "./footer";

/** Chrome shared by every route, so a new page cannot forget the nav or footer. */
export function PageLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background font-sans selection:bg-primary/20 selection:text-primary overflow-x-hidden">
      <Navbar />
      <main>{children}</main>
      <Footer />
    </div>
  );
}

/**
 * The <h1> block at the top of a sub-page. The section components reused below
 * it all lead with an <h2>, so this is what keeps each page to exactly one h1
 * and a sane heading order. pt-32 clears the fixed navbar.
 */
export function PageHero({
  eyebrow,
  title,
  intro,
}: {
  eyebrow: string;
  title: string;
  intro: string;
}) {
  return (
    <section className="pt-32 pb-16 bg-background">
      <div className="max-w-4xl mx-auto px-6 text-center">
        <p className="text-sm font-bold uppercase tracking-[0.22em] text-primary mb-5">
          {eyebrow}
        </p>
        <h1 className="text-4xl md:text-5xl font-bold text-secondary tracking-tight mb-6">
          {title}
        </h1>
        <p className="text-xl text-muted-foreground leading-relaxed">{intro}</p>
      </div>
    </section>
  );
}
