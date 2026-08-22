const MARK_SRC = `${import.meta.env.BASE_URL}zawadi-mark.svg`;

export function BrandPage() {
  return (
    <div className="space-y-6">
      <section className="grid gap-6 rounded-lg border bg-card p-6 text-card-foreground md:grid-cols-[180px_1fr] md:items-center">
        <div className="flex min-h-40 items-center justify-center rounded-md bg-[#0c0f12] p-8">
          <img src={MARK_SRC} alt="Zawadi geometric mark" className="h-24 w-24" />
        </div>
        <div className="space-y-3">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Primary mark</p>
          <h2 className="text-2xl font-semibold">Zawadi HR</h2>
          <p className="max-w-xl text-sm leading-6 text-muted-foreground">
            The geometric mark pairs emerald action energy with a navy foundation.
            Use the compact mark where space is limited; keep product naming separate
            from the mark in larger surfaces.
          </p>
        </div>
      </section>

      <section className="rounded-lg border bg-card p-6 text-card-foreground">
        <h2 className="font-semibold">Brand cues</h2>
        <div className="mt-4 grid gap-3 text-sm text-muted-foreground sm:grid-cols-3">
          <div className="border-l-2 border-primary pl-3">Emerald signals action and positive progress.</div>
          <div className="border-l-2 border-[#182C5B] pl-3">Navy anchors trust and operational focus.</div>
          <div className="border-l-2 border-chart-2 pl-3">Cool cyan and blue support data stories.</div>
        </div>
      </section>
    </div>
  );
}