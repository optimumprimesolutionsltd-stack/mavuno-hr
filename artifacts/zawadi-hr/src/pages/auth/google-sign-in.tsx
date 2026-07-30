import { useEffect, useState } from "react";
import { SignIn } from "@clerk/react";
import { shadcn } from "@clerk/themes";
import { useAuth as useClerkAuth } from "@clerk/react";
import { useLocation } from "wouter";
import { customFetch } from "@workspace/api-client-react";
import { storeToken, clearToken } from "@/lib/session";
import { Loader2 } from "lucide-react";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/branding/zawadi-mark.svg`,
    socialButtonsPlacement: "top" as const,
    socialButtonsVariant: "blockButton" as const,
  },
  variables: {
    colorPrimary: "#10b981",
    colorForeground: "#f8fafc",
    colorMutedForeground: "#94a3b8",
    colorDanger: "#f87171",
    colorBackground: "#111827",
    colorInput: "#0f172a",
    colorInputForeground: "#f8fafc",
    colorNeutral: "#334155",
    fontFamily: "Inter, sans-serif",
    borderRadius: "0.75rem",
  },
  elements: {
    cardBox: "bg-slate-900 border border-slate-700 rounded-2xl w-[440px] max-w-full overflow-hidden",
    card: "!shadow-none !border-0 !bg-transparent",
    footer: "!shadow-none !border-0 !bg-transparent",
    headerTitle: "text-slate-50",
    headerSubtitle: "text-slate-400",
    socialButtonsBlockButtonText: "text-slate-100",
    formFieldLabel: "text-slate-300",
    footerActionLink: "text-emerald-400",
    footerActionText: "text-slate-400",
    dividerText: "text-slate-500",
    formFieldInput: "bg-slate-950 text-slate-50 border-slate-700",
    formButtonPrimary: "bg-emerald-500 hover:bg-emerald-400 text-slate-950",
    socialButtonsBlockButton: "bg-slate-800 border-slate-700 hover:bg-slate-700",
    alert: "bg-red-950/50 border-red-500/40",
    alertText: "text-red-200",
  },
};

function safeRedirect(value: string | null, role: string, employeeId: number | null): string {
  if (role === "admin" || role === "hr") return value === "/admin" ? "/admin" : "/admin";
  if (employeeId) return value === "/portal" ? "/portal" : "/portal";
  return "/admin/login";
}

export function GoogleSignIn() {
  const { isLoaded, isSignedIn, sessionId } = useClerkAuth();
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
      setBridgeError(error?.data?.error ?? "This Google account is not authorized for Zawadi HR.");
    });

    return () => { cancelled = true; };
  }, [isLoaded, isSignedIn, sessionId, setLocation]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-[440px] space-y-4">
        {bridgeError && (
          <div role="alert" className="rounded-lg border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm text-red-200">
            {bridgeError}
          </div>
        )}
        {isSignedIn && !bridgeError ? (
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Verifying your Zawadi HR access…
          </div>
        ) : (
          <SignIn
            routing="path"
            path={`${basePath}/sign-in`}
            signUpUrl={`${basePath}/register`}
            appearance={clerkAppearance}
          />
        )}
      </div>
    </div>
  );
}