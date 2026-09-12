import { Link } from "wouter";
import { PageLayout, PageHero } from "@/components/page-layout";
import { Cta } from "@/components/cta";
import { SITE_ROUTES } from "@/site-routes";
import { ArrowRight } from "lucide-react";

/**
 * The list builds itself from the route manifest — any route under /guides/
 * carrying an `article` block appears here, newest first. Adding a guide is
 * therefore one manifest entry and one page component; nobody has to remember
 * to also link it, which is how index pages end up lying about what exists.
 */
const GUIDES = SITE_ROUTES.filter((r) => r.article && r.path.startsWith("/guides/")).sort(
  (a, b) => (b.article?.published ?? "").localeCompare(a.article?.published ?? ""),
);

function longDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-KE", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function GuidesIndex() {
  return (
    <PageLayout>
      <PageHero
        eyebrow="Guides"
        title="Running payroll in Kenya"
        intro="Practical writing about what Kenyan payroll actually costs and what the KRA expects, with figures computed from the same engine Mavuno HR runs payroll on rather than quoted from memory."
      />

      <section className="pb-20 bg-background">
        <div className="max-w-3xl mx-auto px-6">
          {GUIDES.length === 0 ? (
            <p className="text-muted-foreground">Nothing published yet.</p>
          ) : (
            <ul className="space-y-4">
              {GUIDES.map((g) => (
                <li key={g.path}>
                  <Link
                    href={g.path}
                    className="group block rounded-2xl border border-border bg-white p-6 transition-colors hover:border-primary/40"
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary mb-2">
                      {longDate(g.article!.published)}
                    </p>
                    <h2 className="text-xl font-bold text-secondary tracking-tight mb-2">
                      {g.breadcrumb ?? g.title}
                    </h2>
                    <p className="text-muted-foreground text-sm leading-relaxed mb-3">
                      {g.description}
                    </p>
                    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-primary">
                      Read
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <Cta />
    </PageLayout>
  );
}
