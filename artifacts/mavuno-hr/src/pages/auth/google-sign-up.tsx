import { useEffect, useState } from "react";
import { SignUp, useAuth as useClerkAuth } from "@clerk/react";
import { useLocation, Link } from "wouter";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { customFetch } from "@workspace/api-client-react";
import { storeToken, clearToken } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { safeRedirect, clerkAppearance } from "./google-sign-in";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

// Same list as pages/register.tsx step 1 — kept in sync by hand, not shared,
// matching how that page already keeps its own copy.
const COUNTRIES = [
  { code: "KE", name: "Kenya",        currency: "KES" },
  { code: "UG", name: "Uganda",       currency: "UGX" },
  { code: "TZ", name: "Tanzania",     currency: "TZS" },
  { code: "RW", name: "Rwanda",       currency: "RWF" },
  { code: "ET", name: "Ethiopia",     currency: "ETB" },
  { code: "NG", name: "Nigeria",      currency: "NGN" },
  { code: "GH", name: "Ghana",        currency: "GHS" },
  { code: "ZA", name: "South Africa", currency: "ZAR" },
  { code: "ZM", name: "Zambia",       currency: "ZMW" },
  { code: "MW", name: "Malawi",       currency: "MWK" },
];

function toSlug(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 64);
}

const companySchema = z.object({
  companyName:  z.string().min(2, "Company name is required"),
  slug:         z.string().min(2, "URL slug is required")
                  .max(64)
                  .regex(/^[a-z0-9-]+$/, "Only lowercase letters, numbers, and hyphens"),
  countryCode:  z.string().min(2),
  currencyCode: z.string().min(3),
  kraPin:       z.string().max(20).optional(),
});
type CompanyForm = z.infer<typeof companySchema>;

type Phase = "checking" | "companySetup" | "error";

/**
 * Google sign-up. A fresh Clerk identity is ambiguous on its own — the same
 * "Continue with Google" click covers both "I have an account, log me in"
 * and "I'm new, set me up" — so once Clerk reports isSignedIn, this first
 * tries the existing sign-in bridge (POST /api/auth/clerk/session): if that
 * succeeds, they already had an account and are logged straight in, exactly
 * as if they had used /sign-in. Only a 403 NOT_REGISTERED response — no
 * local account anywhere for this email — falls through to the company-setup
 * form, which POSTs to /api/auth/clerk/register once filled in.
 */
export function GoogleSignUp() {
  const { isLoaded, isSignedIn, sessionId, signOut } = useClerkAuth();
  const [, setLocation] = useLocation();
  const [phase, setPhase] = useState<Phase>("checking");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  const form = useForm<CompanyForm>({
    resolver: zodResolver(companySchema),
    defaultValues: { companyName: "", slug: "", countryCode: "KE", currencyCode: "KES", kraPin: "" },
  });

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !sessionId) return;

    let cancelled = false;
    clearToken();
    setPhase("checking");
    setErrorMsg(null);

    customFetch<any>("/api/auth/clerk/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    }).then((data) => {
      if (cancelled) return;
      // Already had an account — this was really a sign-in, not a sign-up.
      storeToken(data.sessionToken);
      const redirect = new URLSearchParams(window.location.search).get("redirect");
      setLocation(safeRedirect(redirect, data.role, data.employeeId));
    }).catch((error: any) => {
      if (cancelled) return;
      if (error?.data?.code === "NOT_REGISTERED") {
        setPhase("companySetup");
      } else {
        setPhase("error");
        setErrorMsg(error?.data?.error ?? "This Google account could not be verified.");
      }
    });

    return () => { cancelled = true; };
  }, [isLoaded, isSignedIn, sessionId, setLocation]);

  function handleNameChange(name: string) {
    form.setValue("companyName", name);
    if (!form.getFieldState("slug").isDirty) {
      form.setValue("slug", toSlug(name), { shouldValidate: false });
    }
  }
  function handleCountryChange(code: string) {
    form.setValue("countryCode", code);
    const c = COUNTRIES.find((c) => c.code === code);
    if (c) form.setValue("currencyCode", c.currency);
  }

  async function onSubmit(values: CompanyForm) {
    setSubmitting(true);
    try {
      const data = await customFetch<any>("/api/auth/clerk/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: values.companyName,
          slug: values.slug,
          countryCode: values.countryCode,
          currencyCode: values.currencyCode,
          kraPin: values.kraPin || undefined,
        }),
      });
      storeToken(data.sessionToken);
      toast({ title: "Welcome to Mavuno HR!", description: `${values.companyName} is ready to go.` });
      setLocation("/admin");
    } catch (error: any) {
      if (error?.data?.code === "ALREADY_REGISTERED") {
        setPhase("error");
        setErrorMsg("An account already exists for this email — please sign in instead.");
      } else {
        toast({
          variant: "destructive",
          title: "Could not create your company",
          description: error?.data?.error ?? "Something went wrong.",
        });
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-[440px] space-y-4">
        {!isSignedIn ? (
          <SignUp
            routing="path"
            path={`${basePath}/sign-up`}
            signInUrl={`${basePath}/sign-in`}
            fallbackRedirectUrl={`${basePath}/sign-up`}
            appearance={clerkAppearance}
          />
        ) : phase === "companySetup" ? (
          <Card className="border-border/50 shadow-2xl bg-card/80 backdrop-blur-sm">
            <CardHeader className="pb-4">
              <CardTitle className="font-mono text-base">SET UP YOUR COMPANY</CardTitle>
              <CardDescription>One last step — tell us about the organisation</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField control={form.control} name="companyName" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Company Name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Acme Ltd"
                          {...field}
                          onChange={(e) => handleNameChange(e.target.value)}
                          className="bg-background/50"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="slug" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Company URL</FormLabel>
                      <FormControl>
                        <div className="flex items-center gap-0">
                          <span className="h-9 px-3 flex items-center text-xs text-muted-foreground bg-muted border border-r-0 border-border rounded-l-md font-mono whitespace-nowrap">
                            mavuno-hr
                          </span>
                          <Input
                            {...field}
                            placeholder="acme-ltd"
                            className="bg-background/50 rounded-l-none font-mono"
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="countryCode" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Country</FormLabel>
                      <Select value={field.value} onValueChange={handleCountryChange}>
                        <FormControl>
                          <SelectTrigger className="bg-background/50">
                            <SelectValue placeholder="Select country" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {COUNTRIES.map((c) => (
                            <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="currencyCode" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Currency</FormLabel>
                      <FormControl>
                        <Input {...field} className="bg-background/50 font-mono uppercase" maxLength={4} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="kraPin" render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Company KRA PIN
                        <span className="ml-1.5 text-xs text-muted-foreground font-normal">(optional)</span>
                      </FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="P000000000X"
                          className="bg-background/50 font-mono uppercase"
                          maxLength={20}
                          onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <Button type="submit" className="w-full font-mono font-bold mt-2" disabled={submitting}>
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    CREATE COMPANY
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        ) : phase === "error" ? (
          <div className="space-y-3">
            <div role="alert" className="rounded-lg border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm text-red-200">
              {errorMsg}
            </div>
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => { void signOut(() => setLocation(`${basePath}/sign-in`)); }}
                className="text-sm text-emerald-400 hover:text-emerald-300"
              >
                Go to sign in
              </button>
              <Link href="/register" className="text-sm text-muted-foreground hover:text-primary">
                Register with email instead
              </Link>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Checking your account…
          </div>
        )}
      </div>
    </div>
  );
}
