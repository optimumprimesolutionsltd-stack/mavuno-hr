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
  Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface PortalLayoutProps {
  children: ReactNode;
}

const NAV_ITEMS = [
  { href: "/portal", label: "My Profile", icon: User, exact: true },
  { href: "/portal/leave", label: "Leave", icon: Calendar },
  { href: "/portal/loans", label: "Loans", icon: Coins },
  { href: "/portal/p9", label: "P9 Tax Form", icon: FileText },
];

export function PortalGuard({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated, isEmployee } = useAuth();
  const [, setLocation] = useLocation();

  if (isLoading) {
    return <div className="h-screen w-screen flex items-center justify-center bg-background"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
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
      <header className="h-16 border-b border-border bg-card flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center">
          <Building2 className="h-6 w-6 text-primary mr-3" />
          <span className="font-bold text-lg tracking-tight font-mono">ZAWADI<span className="text-primary">.PORTAL</span></span>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1 bg-secondary rounded-full px-3 py-1.5 border border-border">
            <span className="text-xs text-muted-foreground mr-2">Logged in as</span>
            <span className="text-sm font-medium">{user?.name}</span>
          </div>
          <Button variant="ghost" size="icon" onClick={handleLogout} className="text-muted-foreground hover:text-foreground">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>
      
      <div className="flex-1 flex max-w-7xl w-full mx-auto w-full px-6 py-8 gap-8">
        <aside className="w-64 shrink-0 flex flex-col gap-2">
          {NAV_ITEMS.map((item) => {
            const isActive = item.exact ? location === item.href : location.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href} className={`flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors ${isActive ? 'bg-primary/10 text-primary border border-primary/20' : 'text-muted-foreground hover:bg-secondary hover:text-foreground border border-transparent'}`}>
                <item.icon className={`h-5 w-5 mr-3 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
                {item.label}
              </Link>
            );
          })}
        </aside>
        
        <main className="flex-1 min-w-0">
          {children}
        </main>
      </div>
    </div>
  );
}
