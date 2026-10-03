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
    <section className="grid-navy pt-32 pb-16 md:pt-36 md:pb-20 mb-12 md:mb-16">
      <div className="max-w-7xl mx-auto px-6">
        <p className="ref-label text-accent mb-6">{eyebrow}</p>
        <h1 className="display-caps max-w-4xl text-4xl md:text-6xl leading-[1] font-extrabold text-white">
          {title}
        </h1>
        <p className="mt-6 max-w-2xl text-lg md:text-xl text-white/80 leading-relaxed">{intro}</p>
      </div>
    </section>
  );
}
