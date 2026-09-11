import { PageLayout, PageHero } from "@/components/page-layout";
import { Features } from "@/components/features";
import { Cta } from "@/components/cta";

export default function FeaturesPage() {
  return (
    <PageLayout>
      <PageHero
        eyebrow="Features"
        title="Everything your HR team stops doing by hand"
        intro="Most Kenyan payroll still runs on a spreadsheet that one person understands, a folder of scanned contracts, and a WhatsApp thread about leave days. Mavuno HR replaces all three with one system your team can actually see into."
      />
      <Features />
      <Cta />
    </PageLayout>
  );
}
