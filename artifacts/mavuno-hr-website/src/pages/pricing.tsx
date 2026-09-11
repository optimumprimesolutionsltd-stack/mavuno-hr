import { PageLayout, PageHero } from "@/components/page-layout";
import { Pricing } from "@/components/pricing";
import { Cta } from "@/components/cta";

export default function PricingPage() {
  return (
    <PageLayout>
      <PageHero
        eyebrow="Pricing"
        title="Flat monthly pricing, priced on your team size"
        intro="No per-payslip fees and nothing locked behind a higher tier — every plan is the complete platform, and the only thing that changes is how many people you run. Free up to five employees."
      />
      <Pricing />
      <Cta />
    </PageLayout>
  );
}
