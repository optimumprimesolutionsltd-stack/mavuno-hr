import { PageLayout } from "@/components/page-layout";
import { Hero } from "@/components/hero";
import { Features } from "@/components/features";
import { Compliance } from "@/components/compliance";
import { Pricing } from "@/components/pricing";
import { Cta } from "@/components/cta";

export function Home() {
  return (
    <PageLayout>
      <Hero />
      <Features />
      <Compliance />
      <Pricing />
      <Cta />
    </PageLayout>
  );
}
