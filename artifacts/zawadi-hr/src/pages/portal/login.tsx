import { useLocation } from "wouter";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLogin } from "@workspace/api-client-react";
import { storeToken } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Loader2, User } from "lucide-react";
import { Link as RouterLink } from "wouter";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export function PortalLogin() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const loginMutation = useLogin();

  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  function onSubmit(values: z.infer<typeof loginSchema>) {
    loginMutation.mutate(
      { data: values },
      {
        onSuccess: (data) => {
          if (data.role === "employee" || data.role === "admin" || data.role === "hr") {
            if (data.sessionToken) storeToken(data.sessionToken);
            toast({ title: "Welcome", description: `Logged in as ${data.name}` });
            setLocation("/portal");
          } else {
            toast({ variant: "destructive", title: "Access denied", description: "You do not have portal access." });
          }
        },
        onError: () => {
          toast({ variant: "destructive", title: "Login failed", description: "Invalid credentials. Please try again." });
        },
      }
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_bottom_left,_var(--tw-gradient-stops))] from-primary/10 via-background to-background"></div>
      
      <Card className="w-full max-w-md z-10 border-border/50 shadow-2xl bg-card/80 backdrop-blur-sm">
        <CardHeader className="space-y-4 pb-6">
          <div className="mx-auto w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center border border-primary/20">
             <img src="/branding/zawadi-mark.svg" alt="" className="w-7 h-7" />
          </div>
          <div className="text-center space-y-1">
           <CardTitle className="text-2xl font-mono tracking-tight">Mavuno<span className="text-primary"> HR Portal</span></CardTitle>
            <CardDescription>Employee self-service login</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Work Email</FormLabel>
                    <FormControl>
                      <Input placeholder="employee@example.com" {...field} className="bg-background/50" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="••••••••" {...field} className="bg-background/50" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full font-mono font-bold" disabled={loginMutation.isPending}>
                {loginMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                SIGN IN
              </Button>
            </form>
          </Form>
            <div className="relative my-5">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
              <div className="relative flex justify-center text-[10px] uppercase"><span className="bg-card px-2 text-muted-foreground">or</span></div>
            </div>
            <RouterLink href="/sign-in?redirect=/portal" className="flex h-10 w-full items-center justify-center rounded-md border border-border bg-background/50 text-sm font-medium transition-colors hover:bg-accent">
              Continue with Google
            </RouterLink>
        </CardContent>
      </Card>
    </div>
  );
}
