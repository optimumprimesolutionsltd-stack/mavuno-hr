import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useLogout } from "@workspace/api-client-react";
import { useClerk } from "@clerk/react";
import { clearToken } from "@/lib/session";
import { Building2, LayoutGrid, LogOut, Loader2, ShieldCheck, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SuperAdminGuard({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated, isSuperAdmin } = useAuth();
  const [, setLocation] = useLocation();

  if (isLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated || !isSuperAdmin) {
    setTimeout(() => setLocation("/admin/login"), 0);
    return null;
  }

  return <>{children}</>;
}

export function SuperAdminLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const logout = useLogout();
  const { signOut } = useClerk();
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: async () => {
        clearToken();
        await signOut();
        setLocation("/admin/login");
      },
    });
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Sidebar */}
      <aside className="hidden lg:flex w-64 border-r border-border bg-sidebar flex-col fixed inset-y-0 left-0 z-30">
        {/* Logo */}
        <div className="h-16 flex items-center px-6 border-b border-border shrink-0 gap-3">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <span className="font-bold text-lg tracking-tight font-mono">
            MAVUNO<span className="text-primary">.SUPER</span>
          </span>
        </div>

        {/* Nav */}
        <div className="flex-1 overflow-y-auto py-4 flex flex-col gap-1 px-3">
          {[
            { href: "/super", label: "Companies", icon: LayoutGrid, exact: true },
            { href: "/super/billing", label: "Billing", icon: CreditCard },
          ].map((item) => {
            const isActive = item.exact ? location === item.href : location.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center px-3 py-2.5 text-sm font-medium rounded-md transition-colors ${
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              >
                <item.icon className={`h-4 w-4 mr-3 shrink-0 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                {item.label}
              </Link>
            );
          })}

          {/* Link back to own admin panel */}
          <div className="mt-4 pt-4 border-t border-border/50">
            <Link
              href="/admin"
              className="flex items-center px-3 py-2.5 text-sm font-medium rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
            >
              <Building2 className="h-4 w-4 mr-3 shrink-0" />
              My HR Panel
            </Link>
          </div>
        </div>

        {/* User footer */}
        <div className="p-4 border-t border-border shrink-0">
          <div className="flex items-center mb-4 px-2">
            <div className="h-8 w-8 rounded-full bg-primary/20 text-primary flex items-center justify-center font-mono text-xs font-bold mr-3 border border-primary/30 shrink-0">
              {user?.name?.charAt(0) ?? "S"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user?.name}</p>
              <p className="text-xs text-primary truncate font-mono">SUPER ADMIN</p>
            </div>
          </div>
          <Button
            variant="outline"
            className="w-full justify-start text-muted-foreground hover:text-foreground"
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </aside>

      {/* Main */}
      <main className="lg:ml-64 flex flex-col bg-background min-h-screen">
        <div className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
