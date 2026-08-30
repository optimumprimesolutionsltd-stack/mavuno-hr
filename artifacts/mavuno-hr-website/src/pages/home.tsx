import { Navbar } from "@/components/navbar";
import { Hero } from "@/components/hero";
import { Features } from "@/components/features";
import { Compliance } from "@/components/compliance";
import { TallyIntegration } from "@/components/tally-integration";
import { Cta } from "@/components/cta";
import { Footer } from "@/components/footer";

export function Home() {
  return (
    <div className="min-h-screen bg-background font-sans selection:bg-primary/20 selection:text-primary overflow-x-hidden">
      <Navbar />
      <main>
        <Hero />
        <Features />
        <Compliance />
        <TallyIntegration />
        <Cta />
      </main>
      <Footer />
    </div>
  );
}
