import { useState } from "react";
import { Link } from "wouter";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Building2, Loader2, ArrowLeft, Mail } from "lucide-react";
import { customFetch } from "@workspace/api-client-react";

const schema = z.object({
  email: z.string().email("Enter a valid email address"),
});

export function ForgotPassword() {
  const { toast } = useToast();
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { email: "" },
  });

  async function onSubmit(values: z.infer<typeof schema>) {
    setSubmitting(true);
    try {
      await customFetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      setSent(true);
    } catch {
      // Always show success — don't reveal whether email exists
      setSent(true);
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
                zawadi<span className="text-primary">HR</span>
              </CardTitle>
              <CardDescription>
                {sent ? "Check your inbox" : "Enter your admin email to receive a reset link"}
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent>
            {sent ? (
              <div className="space-y-6 text-center">
                <div className="mx-auto w-14 h-14 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
                  <Mail className="w-7 h-7 text-primary" />
                </div>
                <div className="space-y-2">
                  <p className="font-mono font-bold text-sm">EMAIL SENT</p>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    If that email is registered, you'll receive a password reset link
                    within a few minutes. The link expires in <strong className="text-foreground">1 hour</strong>.
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Check your spam folder if you don't see it.
                </p>
              </div>
            ) : (
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Admin Email</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="admin@company.com"
                            type="email"
                            autoComplete="email"
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
                    SEND RESET LINK
                  </Button>
                </form>
              </Form>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-sm text-muted-foreground">
          <Link href="/admin/login" className="text-primary hover:underline font-medium inline-flex items-center gap-1">
            <ArrowLeft className="h-3 w-3" /> Back to login
          </Link>
        </p>
      </div>
    </div>
  );
}
