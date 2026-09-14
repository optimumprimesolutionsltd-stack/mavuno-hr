import type { ReactNode } from "react";
import { Link } from "wouter";
import { PageLayout } from "./page-layout";

/**
 * Long-form chrome for the guides.
 *
 * Same narrow measure as the policy pages — this is prose to be read, not a
 * marketing section to be scanned — but with a dateline and a table, which
 * guides need and policies do not.
 */
export function GuidePage({
  title,
  published,
  readingMinutes,
  intro,
  children,
}: {
  title: string;
  published: string;
  readingMinutes: number;
  intro: string;
  children: ReactNode;
}) {
  return (
    <PageLayout>
      <article className="pt-32 pb-20 bg-background">
        <div className="max-w-3xl mx-auto px-6">
          <Link
            href="/guides"
            className="text-sm font-medium text-primary hover:underline underline-offset-4"
          >
            ← All guides
          </Link>
          <h1 className="text-4xl md:text-5xl font-bold text-secondary tracking-tight mt-5 mb-4">
            {title}
          </h1>
          <p className="text-sm text-muted-foreground mb-8">
            {published} · {readingMinutes} min read
          </p>
          <p className="text-lg text-muted-foreground leading-relaxed mb-12 pb-12 border-b border-border">
            {intro}
          </p>
          <div className="space-y-10">{children}</div>
        </div>
      </article>
    </PageLayout>
  );
}

export function GuideSection({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-2xl font-bold text-secondary tracking-tight mb-4">{heading}</h2>
      <div className="space-y-4 text-muted-foreground leading-relaxed">{children}</div>
    </section>
  );
}

/**
 * Figures table. Scrolls inside its own container rather than pushing the page
 * sideways — these have five columns and most of the audience is on a phone.
 */
export function FigureTable({
  caption,
  headers,
  rows,
  highlightLast,
}: {
  caption: string;
  headers: string[];
  rows: string[][];
  highlightLast?: boolean;
}) {
  return (
    <figure className="my-6">
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              {headers.map((h, i) => (
                <th
                  key={h}
                  scope="col"
                  className={`px-4 py-3 font-semibold text-secondary whitespace-nowrap ${
                    i === 0 ? "text-left" : "text-right"
                  }`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row[0]} className="border-t border-border/60">
                {row.map((cell, i) => (
                  <td
                    key={i}
                    className={`px-4 py-3 whitespace-nowrap tabular-nums ${
                      i === 0 ? "text-left font-medium text-secondary" : "text-right text-muted-foreground"
                    } ${highlightLast && i === row.length - 1 ? "font-semibold text-secondary" : ""}`}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <figcaption className="text-xs text-muted-foreground mt-3 leading-relaxed">
        {caption}
      </figcaption>
    </figure>
  );
}

/** For the thing the reader should take away even if they skim. */
export function KeyPoint({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border-l-4 border-primary bg-primary/5 px-5 py-4 text-secondary leading-relaxed">
      {children}
    </div>
  );
}
