import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useLogout } from "@workspace/api-client-react";
import { 
  Building2, 
  Users, 
  Wallet, 
  Calendar, 
  Clock, 
  Coins, 
  FileText, 
  ShieldAlert, 
  LogOut,
  LayoutDashboard,
  Loader2
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
  { href: "/admin/audit", label: "Audit Log", icon: ShieldAlert },
];

export function AdminGuard({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated, isAdmin } = useAuth();
  const [, setLocation] = useLocation();

  if (isLoading) {
    return <div className="h-screen w-screen flex items-center justify-center bg-background"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (!isAuthenticated || !isAdmin) {
    setLocation("/admin/login");
    return null;
  }

  return <>{children}</>;
}

export function AdminLayout({ children }: AdminLayoutProps) {
  const [location] = useLocation();
  const logout = useLogout();
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => setLocation("/admin/login"),
    });
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      <aside className="w-64 border-r border-border bg-sidebar flex flex-col fixed inset-y-0 left-0">
        <div className="h-16 flex items-center px-6 border-b border-border">
          <Building2 className="h-6 w-6 text-primary mr-3" />
          <span className="font-bold text-lg tracking-tight font-mono">ZAWADI<span className="text-primary">.HR</span></span>
        </div>
        
        <div className="flex-1 overflow-y-auto py-4 flex flex-col gap-1 px-3">
          {NAV_ITEMS.map((item) => {
            const isActive = item.exact ? location === item.href : location.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href} className={`flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${isActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'}`}>
                <item.icon className={`h-4 w-4 mr-3 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
                {item.label}
              </Link>
            );
          })}
        </div>
        
        <div className="p-4 border-t border-border bg-sidebar">
          <div className="flex items-center mb-4 px-2">
            <div className="h-8 w-8 rounded-full bg-primary/20 text-primary flex items-center justify-center font-mono text-xs font-bold mr-3 border border-primary/30">
              {user?.name?.charAt(0) || "A"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user?.name}</p>
              <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
            </div>
          </div>
          <Button variant="outline" className="w-full justify-start text-muted-foreground hover:text-foreground" onClick={handleLogout}>
            <LogOut className="h-4 w-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </aside>
      
      <main className="flex-1 ml-64 flex flex-col bg-background">
        <div className="flex-1 p-8 overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
