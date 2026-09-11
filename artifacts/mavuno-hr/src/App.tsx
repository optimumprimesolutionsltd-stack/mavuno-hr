import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Router as WouterRouter } from 'wouter';
import { Router } from '@/router';
import { setAuthTokenGetter, ApiError } from '@workspace/api-client-react';
import { getToken } from '@/lib/session';
import { ClerkProvider } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";

// Wire up Bearer token auth — used when cookies are blocked (e.g. cross-site iframe preview)
setAuthTokenGetter(getToken);

// Any request anywhere in the app can come back 402 ACCESS_EXPIRED once an
// org's trial/access lapses (enforced server-side by requireActiveAccess()).
// Without this, a lapsed org just sees whatever blank/broken state their
// current page renders on a failed query — send them to Billing instead,
// where the real "access expired" messaging already lives.
function isAccessExpired(error: unknown): boolean {
  return error instanceof ApiError && error.status === 402 &&
    (error.data as any)?.code === "ACCESS_EXPIRED";
}

function redirectToBilling() {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const billingPath = `${base}/admin/billing`;
  if (window.location.pathname !== billingPath) {
    // ?pay=1 — jump straight to the payment/plan dialog, same as the access banner's CTA.
    window.location.assign(`${billingPath}?pay=1`);
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,           // treat data as fresh for 30 s — prevents refetch on every nav
      gcTime: 5 * 60_000,          // keep cache 5 min after unmount
      retry: 1,
      refetchOnWindowFocus: false, // don't refetch when user alt-tabs back
    },
  },
  queryCache: new QueryCache({
    onError: (error) => { if (isAccessExpired(error)) redirectToBilling(); },
  }),
  mutationCache: new MutationCache({
    onError: (error) => { if (isAccessExpired(error)) redirectToBilling(); },
  }),
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
            signUpUrl={`${import.meta.env.BASE_URL.replace(/\/$/, "")}/sign-up`}
            // After OAuth, fall back to /sign-in or /sign-up (not Clerk's "/"
            // default, which is the marketing site) so the Clerk -> Mavuno
            // bridge in GoogleSignIn / GoogleSignUp runs. Passive fallback
            // only — no forceRedirectUrl (see GoogleSignIn's own comment on
            // why that matters).
            signInFallbackRedirectUrl={`${import.meta.env.BASE_URL.replace(/\/$/, "")}/sign-in`}
            signUpFallbackRedirectUrl={`${import.meta.env.BASE_URL.replace(/\/$/, "")}/sign-up`}
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
