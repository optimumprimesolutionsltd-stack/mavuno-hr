import type { ComponentType } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import NotFound from '@/pages/not-found';
import { Home } from '@/pages/home';
import FeaturesPage from '@/pages/features';
import CompliancePage from '@/pages/compliance';
import PricingPage from '@/pages/pricing';
import PayeCalculatorPage from '@/pages/paye-calculator';
import NetToGrossCalculatorPage from '@/pages/net-to-gross-calculator';
import PrivacyPage from '@/pages/privacy';
import TermsPage from '@/pages/terms';
import SecurityPage from '@/pages/security';
import DemoPage from '@/pages/demo';
import { SITE_ROUTES } from '@/site-routes';

const queryClient = new QueryClient();

/**
 * Which component answers each path in the manifest. The routing table below is
 * built FROM site-routes.ts rather than repeating it, so a page can never end up
 * in the sitemap without being reachable, or reachable without a <title>.
 */
const PAGES: Record<string, ComponentType> = {
  '/': Home,
  '/features': FeaturesPage,
  '/compliance': CompliancePage,
  '/paye-calculator': PayeCalculatorPage,
  '/net-to-gross-calculator': NetToGrossCalculatorPage,
  '/privacy': PrivacyPage,
  '/terms': TermsPage,
  '/security': SecurityPage,
  '/demo': DemoPage,
  '/pricing': PricingPage,
};

const missing = SITE_ROUTES.filter((r) => !PAGES[r.path]).map((r) => r.path);
if (missing.length > 0) {
  // Fails the prerender (and the dev server) instead of quietly serving a 404
  // for a URL that is being advertised in the sitemap.
  throw new Error(`site-routes.ts lists paths with no component: ${missing.join(', ')}`);
}

function Router() {
  return (
    <Switch>
      {SITE_ROUTES.map((r) => (
        <Route key={r.path} path={r.path} component={PAGES[r.path]} />
      ))}
      <Route component={NotFound} />
    </Switch>
  );
}

/** `ssrPath` is set only by entry-server.tsx; in the browser wouter reads location. */
function App({ ssrPath }: { ssrPath?: string }) {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')} ssrPath={ssrPath}>
        <Router />
      </WouterRouter>
    </QueryClientProvider>
  );
}

export default App;
