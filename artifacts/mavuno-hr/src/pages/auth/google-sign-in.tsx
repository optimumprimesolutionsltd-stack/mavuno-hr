import { useEffect, useState } from "react";
import { SignIn } from "@clerk/react";
import { shadcn } from "@clerk/themes";
import { useAuth as useClerkAuth } from "@clerk/react";
import { useLocation } from "wouter";
import { customFetch } from "@workspace/api-client-react";
import { storeToken, clearToken } from "@/lib/session";
import { Loader2 } from "lucide-react";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/branding/mavuno-mark.svg`,
    socialButtonsPlacement: "top" as const,
    socialButtonsVariant: "blockButton" as const,
  },
  // The statutory-form look: a white sheet with a navy rule on the paper
  // ground, emerald only for the action.
  variables: {
    colorPrimary: "#0B8457",
    colorForeground: "#0A1B33",
    colorMutedForeground: "#4B5A73",
    colorDanger: "#B91C1C",
    colorBackground: "#FFFFFF",
    colorInput: "#FFFFFF",
    colorInputForeground: "#0A1B33",
    colorNeutral: "#0A1B33",
    fontFamily: "'Public Sans', system-ui, sans-serif",
    borderRadius: "0.125rem",
  },
  elements: {
    cardBox: "bg-white border-2 border-[#0A1B33] rounded-[2px] w-[440px] max-w-full overflow-hidden shadow-[10px_10px_0_rgb(11_132_87/0.18)]",
    card: "!shadow-none !border-0 !bg-transparent",
    footer: "!shadow-none !border-0 !bg-transparent",
    headerTitle: "text-[#0A1B33] font-extrabold uppercase [font-family:Archivo,sans-serif] [font-stretch:112%]",
    headerSubtitle: "text-slate-600",
    formFieldLabel: "text-slate-700",
    footerActionLink: "text-emerald-700",
    footerActionText: "text-slate-600",
    dividerText: "text-slate-500",
    formFieldInput: "bg-white text-[#0A1B33] border-slate-300",
    formButtonPrimary: "bg-[#0B8457] hover:bg-[#0A1B33] text-white",
    socialButtonsBlockButton:
      "!bg-white !border !border-slate-300 hover:!bg-slate-50",
    socialButtonsBlockButtonText: "!text-[#0A1B33] !font-medium",
    alert: "bg-red-50 border-red-300",
    alertText: "text-red-800",
  },
};

export function safeRedirect(value: string | null, role: string, employeeId: number | null): string {
  if (role === "admin" || role === "hr") return value === "/admin" ? "/admin" : "/admin";
  if (employeeId) return value === "/portal" ? "/portal" : "/portal";
  return "/admin/login";
}

export function GoogleSignIn() {
  const { isLoaded, isSignedIn, sessionId, signOut } = useClerkAuth();
  const [, setLocation] = useLocation();
  const [bridgeError, setBridgeError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !sessionId) return;

    let cancelled = false;
    clearToken();
    setBridgeError(null);

    customFetch<any>("/api/auth/clerk/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    }).then((data) => {
      if (cancelled) return;
      storeToken(data.sessionToken);
      const redirect = new URLSearchParams(window.location.search).get("redirect");
      setLocation(safeRedirect(redirect, data.role, data.employeeId));
    }).catch((error: any) => {
      if (cancelled) return;
       setBridgeError(error?.data?.error ?? "This Google account is not authorized for Mavuno HR.");
    });

    return () => { cancelled = true; };
  }, [isLoaded, isSignedIn, sessionId, setLocation]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-[440px] space-y-4">
        {isSignedIn ? (
          // Already through Clerk — only ever show the bridge state here, never
          // <SignIn>. Rendering <SignIn> while Clerk-signed-in is what let the
          // reverted #16 loop; keeping it out removes that vector entirely.
          bridgeError ? (
            <div className="space-y-3">
              <div role="alert" className="rounded-lg border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm text-red-800">
                {bridgeError}
              </div>
              <button
                type="button"
                onClick={() => { void signOut(() => setLocation("/admin/login")); }}
                className="text-sm text-emerald-700 hover:text-emerald-700"
              >
                Back to login
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Verifying your Mavuno HR access…
            </div>
          )
        ) : (
          <SignIn
            routing="path"
            path={`${basePath}/sign-in`}
            signUpUrl={`${basePath}/sign-up`}
            fallbackRedirectUrl={`${basePath}/sign-in`}
            appearance={clerkAppearance}
          />
        )}
      </div>
    </div>
  );
}