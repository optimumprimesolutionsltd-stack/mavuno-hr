import { useState } from "react";
import { Link, useLocation } from "wouter";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Building2, Loader2, ArrowLeft, CheckCircle2 } from "lucide-react";
import { customFetch } from "@workspace/api-client-react";

const schema = z.object({
  password: z.string().min(7, "Password must be at least 7 characters"),
  confirm: z.string(),
}).refine((d) => d.password === d.confirm, {
  message: "Passwords do not match",
  path: ["confirm"],
});

export function ResetPassword() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  // Extract token from query string
  const token = new URLSearchParams(window.location.search).get("token") ?? "";

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { password: "", confirm: "" },
  });

  async function onSubmit(values: z.infer<typeof schema>) {
    if (!token) {
      toast({ variant: "destructive", title: "Invalid link", description: "Missing reset token. Request a new link." });
      return;
    }
    setSubmitting(true);
    try {
      await customFetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password: values.password }),
      });
      setDone(true);
      setTimeout(() => setLocation("/admin/login"), 3000);
    } catch (err: any) {
      const msg = err?.message ?? "Reset failed";
      toast({ variant: "destructive", title: "Reset failed", description: msg });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/10 via-background to-background" />

      <div className="w-full max-w-md z-10 space-y-4">
        <Card className="border-border/50 shadow-2xl bg-card/80 backdrop-blur-sm">
          <CardHeader className="space-y-4 pb-6">
            <div className="mx-auto w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center border border-primary/20">
              <Building2 className="w-6 h-6 text-primary" />
            </div>
            <div className="text-center space-y-1">
              <CardTitle className="text-2xl font-mono tracking-tight">
                Mizani<span className="text-primary"> HR</span>
              </CardTitle>
              <CardDescription>
                {done ? "Password updated" : "Choose a new password for your account"}
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent>
            {!token && !done ? (
              <div className="text-center space-y-4">
                <p className="text-sm text-destructive font-mono">INVALID OR MISSING TOKEN</p>
                <p className="text-sm text-muted-foreground">
                  This link is invalid or has already been used.
                </p>
                <Link href="/admin/forgot-password">
                  <Button variant="outline" className="font-mono w-full">REQUEST NEW LINK</Button>
                </Link>
              </div>
            ) : done ? (
              <div className="space-y-6 text-center">
                <div className="mx-auto w-14 h-14 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
                  <CheckCircle2 className="w-7 h-7 text-primary" />
                </div>
                <div className="space-y-2">
                  <p className="font-mono font-bold text-sm">PASSWORD UPDATED</p>
                  <p className="text-sm text-muted-foreground">
                    Your password has been changed. Redirecting to login…
                  </p>
                </div>
              </div>
            ) : (
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>New Password</FormLabel>
                        <FormControl>
                          <Input
                            type="password"
                            placeholder="At least 12 characters"
                            autoComplete="new-password"
                            {...field}
                            className="bg-background/50"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="confirm"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Confirm Password</FormLabel>
                        <FormControl>
                          <Input
                            type="password"
                            placeholder="Repeat new password"
                            autoComplete="new-password"
                            {...field}
                            className="bg-background/50"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    type="submit"
                    className="w-full font-mono font-bold"
                    disabled={submitting}
                  >
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    SET NEW PASSWORD
                  </Button>
                </form>
              </Form>
            )}
          </CardContent>
        </Card>

        {!done && (
          <p className="text-center text-sm text-muted-foreground">
            <Link href="/admin/login" className="text-primary hover:underline font-medium inline-flex items-center gap-1">
              <ArrowLeft className="h-3 w-3" /> Back to login
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
