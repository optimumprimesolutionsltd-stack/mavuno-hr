import { ReactNode, useState, useEffect, useRef, useCallback } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useLogout, customFetch } from "@workspace/api-client-react";
import { useClerk } from "@clerk/react";
import { clearToken } from "@/lib/session";
import {
  Building2,
  Users,
  Wallet,
  Calendar,
  Clock,
  Coins,
  LogOut,
  LayoutDashboard,
  Loader2,
  KeyRound,
  Menu,
  X,
  ShieldCheck,
  Settings,
  CreditCard,
  Bell,
  BellRing,
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
  { href: "/admin/users", label: "Access & Logins", icon: KeyRound },
  { href: "/admin/audit", label: "Audit Log", icon: ShieldCheck },
  { href: "/admin/billing", label: "Billing", icon: CreditCard },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

interface Notification {
  id: number;
  type: string;
  title: string;
  body: string;
  link?: string | null;
  readAt: string | null;
  createdAt: string;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const popoverRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [, setLocation] = useLocation();

  const fetchNotifications = useCallback(async () => {
    try {
      const data = (await customFetch("/api/notifications")) as {
        notifications: Notification[];
        unreadCount: number;
      };
      setNotifications(data.notifications.slice(0, 10));
      setUnreadCount(data.unreadCount);
    } catch {
      // silently fail — notifications are non-critical
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30_000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  // Close popover on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const markAllRead = async () => {
    try {
      await customFetch("/api/notifications/read-all", { method: "PATCH" });
      setNotifications((prev) => prev.map((n) => ({ ...n, readAt: new Date().toISOString() })));
      setUnreadCount(0);
    } catch {
      // ignore
    }
  };

  const markRead = async (id: number) => {
    try {
      await customFetch(`/api/notifications/${id}/read`, { method: "PATCH" });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      // ignore
    }
  };

  const handleNotificationClick = (n: Notification) => {
    if (!n.readAt) markRead(n.id);
    if (n.link) {
      setOpen(false);
      setLocation(n.link);
    }
  };

  const BellIcon = unreadCount > 0 ? BellRing : Bell;

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setOpen((o) => !o)}
        className="relative h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
        aria-label="Notifications"
      >
        <BellIcon className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 h-4 min-w-[1rem] px-0.5 flex items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white leading-none">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={popoverRef}
          className="absolute right-0 mt-2 w-80 bg-card border border-border rounded-lg shadow-xl z-50 overflow-hidden"
          style={{ top: "100%" }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <span className="text-sm font-semibold text-foreground">Notifications</span>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs text-primary hover:text-primary/80 transition-colors"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-96 overflow-y-auto divide-y divide-border">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                No notifications yet
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  onClick={() => handleNotificationClick(n)}
                  className={`px-4 py-3 transition-colors ${
                    n.link ? "cursor-pointer hover:bg-secondary/60" : "cursor-default"
                  } ${!n.readAt ? "bg-primary/5" : ""}`}
                >
                  <div className="flex items-start gap-2">
                    {/* Unread dot */}
                    <span
                      className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${
                        !n.readAt ? "bg-primary" : "bg-transparent"
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground leading-snug truncate">
                        {n.title}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                        {n.body}
                      </p>
                      <p className="text-[10px] text-muted-foreground/70 mt-1">
                        {timeAgo(n.createdAt)}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

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
  const { signOut } = useClerk();
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: async () => {
        clearToken();
        await signOut();
        setLocation("/admin/login");
      },
    });
  };

  const closeSidebar = () => setSidebarOpen(false);

  const SidebarContent = () => (
    <>
      {/* Logo */}
      <div className="h-16 flex items-center px-6 border-b border-border shrink-0">
        <img src="/branding/zawadi-mark.svg" alt="" className="h-7 w-7 mr-3" />
        <span className="font-bold text-lg tracking-tight font-mono">
           zawadi<span className="text-primary">HR</span>
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
            <img src="/branding/zawadi-mark.svg" alt="" className="h-6 w-6" />
        <span className="font-bold tracking-tight font-mono text-base">
            zawadi<span className="text-primary">HR</span>
        </span>
        {/* Bell on mobile topbar */}
        <div className="ml-auto">
          <NotificationBell />
        </div>
      </header>

      {/* ── Desktop topbar for bell icon ── */}
      <div className="hidden lg:flex fixed top-0 right-0 z-30 h-0 items-start justify-end pr-6 pt-4">
        <NotificationBell />
      </div>

      {/* ── Main content ── */}
      <main className="lg:ml-64 flex flex-col bg-background min-h-screen">
        <div className="flex-1 p-4 sm:p-6 lg:p-8 pt-[4.5rem] lg:pt-8 overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
