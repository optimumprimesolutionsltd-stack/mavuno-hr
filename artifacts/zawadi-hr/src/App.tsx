import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Router as WouterRouter } from 'wouter';
import { Router } from '@/router';
import { setAuthTokenGetter } from '@workspace/api-client-react';
import { getToken } from '@/lib/session';
import { ClerkProvider } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";

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

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <ClerkProvider
            publishableKey={clerkPubKey}
            proxyUrl={clerkProxyUrl}
            signInUrl={`${import.meta.env.BASE_URL.replace(/\/$/, "")}/sign-in`}
            signUpUrl={`${import.meta.env.BASE_URL.replace(/\/$/, "")}/register`}
            localization={{
              signIn: {
                start: {
                  title: "Sign in to Mavuno HR",
                  subtitle: "Welcome back. Please sign in to continue.",
                },
              },
            }}
          >
            <Router />
          </ClerkProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
