import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Router as WouterRouter } from 'wouter';
import { Router } from '@/router';
import { setAuthTokenGetter } from '@workspace/api-client-react';
import { getToken } from '@/lib/session';

// Wire up Bearer token auth — used when cookies are blocked (e.g. cross-site iframe preview)
setAuthTokenGetter(getToken);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,           // treat data as fresh for 30 s — prevents refetch on every nav
      gcTime: 5 * 60_000,          // keep cache 5 min after unmount
      retry: 1,
      refetchOnWindowFocus: false, // don't refetch when user alt-tabs back
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
