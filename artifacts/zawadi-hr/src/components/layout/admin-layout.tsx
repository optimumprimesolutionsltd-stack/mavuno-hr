import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useLogout } from "@workspace/api-client-react";
import { clearToken } from "@/lib/session";
import {
  Building2,
  Users,
  Wallet,
  Calendar,
  Clock,
  Coins,
  FileText,
  LogOut,
  LayoutDashboard,
  Loader2,
  KeyRound,
  Menu,
  X,
  ShieldCheck,
  Settings,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface AdminLayoutProps {
  children: ReactNode;
}

const NAV_ITEMS = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/admin/employees", label: "Employees", icon: Users },
  { href: "/admin/payroll", label: "Payroll Runs", icon: Wallet },
  { href: "/admin/leave", label: "Leave", icon: Calendar },
  { href: "/admin/timesheets", label: "Timesheets", icon: Clock },
  { href: "/admin/loans", label: "Loans", icon: Coins },
  { href: "/admin/reports", label: "Reports", icon: FileText },
  { href: "/admin/users", label: "Access & Logins", icon: KeyRound },
  { href: "/admin/audit", label: "Audit Log", icon: ShieldCheck },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

export function AdminGuard({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated, isAdmin } = useAuth();
  const [, setLocation] = useLocation();

  if (isLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isLoading && (!isAuthenticated || !isAdmin)) {
    setTimeout(() => setLocation("/admin/login"), 0);
    return null;
  }

  return <>{children}</>;
}

export function AdminLayout({ children }: AdminLayoutProps) {
  const [location] = useLocation();
  const logout = useLogout();
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        clearToken();
        setLocation("/admin/login");
      },
    });
  };

  const closeSidebar = () => setSidebarOpen(false);

  const SidebarContent = () => (
    <>
      {/* Logo */}
      <div className="h-16 flex items-center px-6 border-b border-border shrink-0">
        <Building2 className="h-6 w-6 text-primary mr-3" />
        <span className="font-bold text-lg tracking-tight font-mono">
          ZAWADI<span className="text-primary">.HR</span>
        </span>
        {/* Close button — mobile only */}
        <button
          onClick={closeSidebar}
          className="ml-auto lg:hidden text-muted-foreground hover:text-foreground"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Nav items */}
      <div className="flex-1 overflow-y-auto py-4 flex flex-col gap-1 px-3">
        {NAV_ITEMS.map((item) => {
          const isActive = item.exact
            ? location === item.href
            : location.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={closeSidebar}
              className={`flex items-center px-3 py-2.5 text-sm font-medium rounded-md transition-colors ${
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
            >
              <item.icon
                className={`h-4 w-4 mr-3 shrink-0 ${isActive ? "text-primary" : "text-muted-foreground"}`}
              />
              {item.label}
            </Link>
          );
        })}
      </div>

      {/* User footer */}
      <div className="p-4 border-t border-border bg-sidebar shrink-0">
        <div className="flex items-center mb-4 px-2">
          <div className="h-8 w-8 rounded-full bg-primary/20 text-primary flex items-center justify-center font-mono text-xs font-bold mr-3 border border-primary/30 shrink-0">
            {user?.name?.charAt(0) || "A"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{user?.name}</p>
            <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
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
    </>
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ── Desktop sidebar (always visible ≥ lg) ── */}
      <aside className="hidden lg:flex w-64 border-r border-border bg-sidebar flex-col fixed inset-y-0 left-0 z-30">
        <SidebarContent />
      </aside>

      {/* ── Mobile: backdrop overlay ── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={closeSidebar}
        />
      )}

      {/* ── Mobile: slide-in drawer ── */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 bg-sidebar border-r border-border flex flex-col transform transition-transform duration-200 ease-in-out lg:hidden ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <SidebarContent />
      </aside>

      {/* ── Mobile topbar ── */}
      <header className="lg:hidden fixed top-0 inset-x-0 z-30 h-14 bg-card border-b border-border flex items-center px-4 gap-3">
        <button
          onClick={() => setSidebarOpen(true)}
          className="text-muted-foreground hover:text-foreground"
        >
          <Menu className="h-5 w-5" />
        </button>
        <Building2 className="h-5 w-5 text-primary" />
        <span className="font-bold tracking-tight font-mono text-base">
          ZAWADI<span className="text-primary">.HR</span>
        </span>
      </header>

      {/* ── Main content ── */}
      <main className="lg:ml-64 flex flex-col bg-background min-h-screen">
        <div className="flex-1 p-4 sm:p-6 lg:p-8 pt-[4.5rem] lg:pt-8 overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
