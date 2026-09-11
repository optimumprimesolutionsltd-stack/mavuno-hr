import { ArrowLeft } from 'lucide-react';

/**
 * Shown for any path other than "/". The api-server serves this document with a
 * real 404 status, so this is what an actual visitor who mistyped a URL sees —
 * it needs to read like the rest of the site, not like a dev scaffold.
 */
export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background px-6">
      <div className="w-full max-w-lg text-center">
        <p className="text-sm font-bold uppercase tracking-[0.22em] text-primary mb-4">
          Error 404
        </p>
        <h1 className="text-3xl md:text-4xl font-bold text-secondary mb-4">
          We couldn&rsquo;t find that page
        </h1>
        <p className="text-muted-foreground leading-relaxed mb-8">
          The link may be out of date, or the address may have a typo in it.
          Everything about Mavuno HR lives on the home page.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <a
            href="/"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Mavuno HR
          </a>
          <a
            href="/app/"
            className="inline-flex items-center justify-center rounded-lg border border-border px-6 py-3 text-sm font-semibold text-secondary hover:bg-muted transition-colors"
          >
            Sign in to your account
          </a>
        </div>
        <p className="mt-10 text-sm text-muted-foreground">
          Still stuck?{' '}
          <a href="mailto:info@mavunohr.co.ke" className="text-primary font-medium hover:underline">
            info@mavunohr.co.ke
          </a>
        </p>
      </div>
    </div>
  );
}
