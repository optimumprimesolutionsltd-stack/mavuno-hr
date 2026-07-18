import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useLogout } from "@workspace/api-client-react";
import {
  Building2,
  User,
  Calendar,
  Coins,
  FileText,
  LogOut,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface PortalLayoutProps {
  children: ReactNode;
}

const NAV_ITEMS = [
  { href: "/portal", label: "My Profile", icon: User, exact: true },
  { href: "/portal/leave", label: "Leave", icon: Calendar },
  { href: "/portal/loans", label: "Loans", icon: Coins },
  { href: "/portal/p9", label: "P9 Form", icon: FileText },
];

export function PortalGuard({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated, isEmployee } = useAuth();
  const [, setLocation] = useLocation();

  if (isLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isLoading && (!isAuthenticated || !isEmployee)) {
    setTimeout(() => setLocation("/portal/login"), 0);
    return null;
  }

  return <>{children}</>;
}

export function PortalLayout({ children }: PortalLayoutProps) {
  const [location] = useLocation();
  const logout = useLogout();
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => setLocation("/portal/login"),
    });
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* ── Top header ── */}
      <header className="h-14 sm:h-16 border-b border-border bg-card flex items-center justify-between px-4 sm:px-6 shrink-0 sticky top-0 z-20">
        <div className="flex items-center gap-2 sm:gap-3">
          <Building2 className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
          <span className="font-bold tracking-tight font-mono text-base sm:text-lg">
            ZAWADI<span className="text-primary">.PORTAL</span>
          </span>
        </div>

        <div className="flex items-center gap-2 sm:gap-4">
          {/* Name pill — hidden on very small screens */}
          <div className="hidden sm:flex items-center gap-1 bg-secondary rounded-full px-3 py-1.5 border border-border">
            <span className="text-xs text-muted-foreground mr-1">Hi,</span>
            <span className="text-sm font-medium">{user?.name?.split(" ")[0]}</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleLogout}
            className="text-muted-foreground hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* ── Body: sidebar (desktop) + content ── */}
      <div className="flex-1 flex max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8 gap-6 lg:gap-8 pb-20 sm:pb-6">
        {/* Desktop sidebar */}
        <aside className="hidden sm:flex w-52 lg:w-64 shrink-0 flex-col gap-1.5">
          {NAV_ITEMS.map((item) => {
            const isActive = item.exact
              ? location === item.href
              : location.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
                  isActive
                    ? "bg-primary/10 text-primary border border-primary/20"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground border border-transparent"
                }`}
              >
                <item.icon
                  className={`h-5 w-5 mr-3 shrink-0 ${isActive ? "text-primary" : "text-muted-foreground"}`}
                />
                {item.label}
              </Link>
            );
          })}
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0">{children}</main>
      </div>

      {/* ── Mobile bottom navigation ── */}
      <nav className="sm:hidden fixed bottom-0 inset-x-0 z-20 bg-card border-t border-border flex items-stretch">
        {NAV_ITEMS.map((item) => {
          const isActive = item.exact
            ? location === item.href
            : location.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex-1 flex flex-col items-center justify-center py-2 gap-1 text-[10px] font-medium transition-colors ${
                isActive ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <item.icon
                className={`h-5 w-5 ${isActive ? "text-primary" : "text-muted-foreground"}`}
              />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
