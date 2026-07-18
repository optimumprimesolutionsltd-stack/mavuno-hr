import { useState } from "react";
import { Link, useLocation } from "wouter";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { storeToken } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Building2, Loader2, ChevronRight, ChevronLeft, CheckCircle } from "lucide-react";

// ── Slugify helper ──────────────────────────────────────────────
function toSlug(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 64);
}

// ── Schemas ─────────────────────────────────────────────────────
const step1Schema = z.object({
  companyName:  z.string().min(2, "Company name is required"),
  slug:         z.string().min(2, "URL slug is required")
                  .max(64)
                  .regex(/^[a-z0-9-]+$/, "Only lowercase letters, numbers, and hyphens"),
  countryCode:  z.string().min(2),
  currencyCode: z.string().min(3),
  kraPin:       z.string().max(20).optional(),
});

const step2Schema = z.object({
  adminName:       z.string().min(2, "Your name is required"),
  adminEmail:      z.string().email("Invalid email address"),
  password:        z.string().min(12, "Password must be at least 12 characters"),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

type Step1 = z.infer<typeof step1Schema>;
type Step2 = z.infer<typeof step2Schema>;

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

// ── Component ───────────────────────────────────────────────────
export function Register() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [step, setStep] = useState<1 | 2>(1);
  const [step1Data, setStep1Data] = useState<Step1 | null>(null);
  const [loading, setLoading] = useState(false);

  // Step 1 form
  const form1 = useForm<Step1>({
    resolver: zodResolver(step1Schema),
    defaultValues: { companyName: "", slug: "", countryCode: "KE", currencyCode: "KES", kraPin: "" },
  });

  // Step 2 form
  const form2 = useForm<Step2>({
    resolver: zodResolver(step2Schema),
    defaultValues: { adminName: "", adminEmail: "", password: "", confirmPassword: "" },
  });

  // Auto-fill slug when company name changes
  function handleNameChange(name: string) {
    form1.setValue("companyName", name);
    if (!form1.getFieldState("slug").isDirty) {
      form1.setValue("slug", toSlug(name), { shouldValidate: false });
    }
  }

  // Auto-fill currency when country changes
  function handleCountryChange(code: string) {
    form1.setValue("countryCode", code);
    const c = COUNTRIES.find((c) => c.code === code);
    if (c) form1.setValue("currencyCode", c.currency);
  }

  function onStep1(values: Step1) {
    setStep1Data(values);
    setStep(2);
  }

  async function onStep2(values: Step2) {
    if (!step1Data) return;
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName:  step1Data.companyName,
          slug:         step1Data.slug,
          countryCode:  step1Data.countryCode,
          currencyCode: step1Data.currencyCode,
          kraPin:       step1Data.kraPin || undefined,
          adminName:    values.adminName,
          adminEmail:   values.adminEmail,
          password:     values.password,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ variant: "destructive", title: "Registration failed", description: data.error ?? "Something went wrong." });
        return;
      }
      storeToken(data.sessionToken);
      toast({ title: "Welcome to Zawadi HR!", description: `${step1Data.companyName} is ready to go.` });
      setLocation("/admin");
    } catch {
      toast({ variant: "destructive", title: "Network error", description: "Could not connect to the server." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-primary/10 via-background to-background" />

      <div className="w-full max-w-md z-10 space-y-4">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="mx-auto w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center border border-primary/20">
            <Building2 className="w-6 h-6 text-primary" />
          </div>
          <h1 className="text-2xl font-mono font-bold tracking-tight">
            ZAWADI<span className="text-primary">.HR</span>
          </h1>
          <p className="text-muted-foreground text-sm">Set up your company in 2 minutes</p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 px-2">
          {[1, 2].map((s) => (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-mono font-bold border transition-colors shrink-0 ${
                step > s
                  ? "bg-primary border-primary text-primary-foreground"
                  : step === s
                  ? "border-primary text-primary bg-primary/10"
                  : "border-border text-muted-foreground"
              }`}>
                {step > s ? <CheckCircle className="h-3.5 w-3.5" /> : s}
              </div>
              <span className={`text-xs font-mono hidden sm:block ${step === s ? "text-foreground" : "text-muted-foreground"}`}>
                {s === 1 ? "COMPANY" : "ADMIN ACCOUNT"}
              </span>
              {s < 2 && <div className="flex-1 h-px bg-border" />}
            </div>
          ))}
        </div>

        {/* ── Step 1: Company details ── */}
        {step === 1 && (
          <Card className="border-border/50 shadow-2xl bg-card/80 backdrop-blur-sm">
            <CardHeader className="pb-4">
              <CardTitle className="font-mono text-base">YOUR COMPANY</CardTitle>
              <CardDescription>Tell us about the organisation</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form1}>
                <form onSubmit={form1.handleSubmit(onStep1)} className="space-y-4">
                  {/* Company name */}
                  <FormField control={form1.control} name="companyName" render={({ field }) => (
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

                  {/* Slug */}
                  <FormField control={form1.control} name="slug" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Company URL</FormLabel>
                      <FormControl>
                        <div className="flex items-center gap-0">
                          <span className="h-9 px-3 flex items-center text-xs text-muted-foreground bg-muted border border-r-0 border-border rounded-l-md font-mono whitespace-nowrap">
                            zawadi.hr/
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

                  {/* Country */}
                  <FormField control={form1.control} name="countryCode" render={({ field }) => (
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

                  {/* Currency */}
                  <FormField control={form1.control} name="currencyCode" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Currency</FormLabel>
                      <FormControl>
                        <Input {...field} className="bg-background/50 font-mono uppercase" maxLength={4} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  {/* KRA PIN */}
                  <FormField control={form1.control} name="kraPin" render={({ field }) => (
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

                  <Button type="submit" className="w-full font-mono font-bold mt-2">
                    NEXT <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        )}

        {/* ── Step 2: Admin account ── */}
        {step === 2 && (
          <Card className="border-border/50 shadow-2xl bg-card/80 backdrop-blur-sm">
            <CardHeader className="pb-4">
              <CardTitle className="font-mono text-base">ADMIN ACCOUNT</CardTitle>
              <CardDescription>This will be the first login for <span className="text-foreground font-medium">{step1Data?.companyName}</span></CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form2}>
                <form onSubmit={form2.handleSubmit(onStep2)} className="space-y-4">
                  <FormField control={form2.control} name="adminName" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Your Full Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Jane Mwangi" {...field} className="bg-background/50" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form2.control} name="adminEmail" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Work Email</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="jane@acme.co.ke" {...field} className="bg-background/50" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form2.control} name="password" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="Min 12 characters" {...field} className="bg-background/50" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form2.control} name="confirmPassword" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirm Password</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="Repeat password" {...field} className="bg-background/50" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <div className="flex gap-2 mt-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="font-mono"
                      onClick={() => setStep(1)}
                    >
                      <ChevronLeft className="h-4 w-4 mr-1" /> BACK
                    </Button>
                    <Button type="submit" className="flex-1 font-mono font-bold" disabled={loading}>
                      {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      CREATE ACCOUNT
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        )}

        {/* Back to login */}
        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/admin/login" className="text-primary hover:underline font-medium">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
