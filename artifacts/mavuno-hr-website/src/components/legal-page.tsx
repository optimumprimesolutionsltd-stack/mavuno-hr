import type { ReactNode } from "react";
import { PageLayout } from "./page-layout";

/**
 * Shared shell for the policy pages. They are long-form prose rather than
 * marketing sections, so they get a narrower measure and consistent heading
 * rhythm instead of the section components used elsewhere.
 */
export function LegalPage({
  title,
  updated,
  intro,
  children,
}: {
  title: string;
  updated: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <PageLayout>
      <article className="pt-32 pb-20 bg-background">
        <div className="max-w-3xl mx-auto px-6">
          <h1 className="text-4xl md:text-5xl font-bold text-secondary tracking-tight mb-4">
            {title}
          </h1>
          <p className="text-sm text-muted-foreground mb-8">Last updated {updated}</p>
          <p className="text-lg text-muted-foreground leading-relaxed mb-12 pb-12 border-b border-border">
            {intro}
          </p>
          <div className="space-y-10">{children}</div>
        </div>
      </article>
    </PageLayout>
  );
}

export function Section({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-2xl font-bold text-secondary tracking-tight mb-4">{heading}</h2>
      <div className="space-y-4 text-muted-foreground leading-relaxed">{children}</div>
    </section>
  );
}

export function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <ul className="space-y-2 list-disc pl-5 marker:text-primary">
      {items.map((item, i) => (
        <li key={i} className="leading-relaxed">
          {item}
        </li>
      ))}
    </ul>
  );
}

/** For the things a policy has to say plainly rather than bury. */
export function Callout({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border-l-4 border-primary bg-primary/5 px-5 py-4 text-secondary leading-relaxed">
      {children}
    </div>
  );
}
