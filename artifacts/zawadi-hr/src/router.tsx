import { Switch, Route, Redirect } from "wouter";
import { AdminLogin } from "@/pages/admin/login";
import { ForgotPassword } from "@/pages/admin/forgot-password";
import { ResetPassword } from "@/pages/admin/reset-password";
import { Register } from "@/pages/register";
import { AdminDashboard } from "@/pages/admin/dashboard";
import { EmployeeList } from "@/pages/admin/employees/list";
import { EmployeeDetail } from "@/pages/admin/employees/detail";
import { PayrollList } from "@/pages/admin/payroll/list";
import { PayrollDetail } from "@/pages/admin/payroll/detail";
import { LeaveAdmin } from "@/pages/admin/leave";
import { TimesheetAdmin } from "@/pages/admin/timesheets";
import { LoansAdmin } from "@/pages/admin/loans";
import { Reports } from "@/pages/admin/reports";
import { UsersAdmin } from "@/pages/admin/users";
import { AuditLog } from "@/pages/admin/audit";
import { AdminSettings } from "@/pages/admin/settings";

import { PortalLogin } from "@/pages/portal/login";
import { PortalProfile } from "@/pages/portal/profile";
import { PortalLeave } from "@/pages/portal/leave";
import { PortalLoans } from "@/pages/portal/loans";
import { PortalP9 } from "@/pages/portal/p9";

import { AdminLayout, AdminGuard } from "@/components/layout/admin-layout";
import { PortalLayout, PortalGuard } from "@/components/layout/portal-layout";
import { SuperAdminLayout, SuperAdminGuard } from "@/components/layout/super-layout";
import { SuperAdminCompanies } from "@/pages/super";
import { SuperAdminBilling } from "@/pages/super/billing";
import { AdminBilling } from "@/pages/admin/billing";
import { FilingsPage } from "@/pages/admin/filings";
import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";

function RootRedirect() {
  const { isLoading, isAuthenticated, isAdmin, isEmployee } = useAuth();
  
  if (isLoading) return <div className="h-screen w-screen flex items-center justify-center bg-background"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!isAuthenticated) return <Redirect to="/admin/login" />;
  if (isAdmin) return <Redirect to="/admin" />;
  if (isEmployee) return <Redirect to="/portal" />;
  return <Redirect to="/admin/login" />;
}

export function Router() {
  return (
    <Switch>
      <Route path="/" component={RootRedirect} />

      {/* ── Public auth pages ── */}
      <Route path="/register" component={Register} />
      <Route path="/admin/login" component={AdminLogin} />
      <Route path="/admin/forgot-password" component={ForgotPassword} />
      <Route path="/admin/reset-password" component={ResetPassword} />

      {/* ── Admin dashboard (exact /admin) ── */}
      <Route path="/admin">
        <AdminGuard>
          <AdminLayout>
            <AdminDashboard />
          </AdminLayout>
        </AdminGuard>
      </Route>

      {/* ── Admin sub-pages (/admin/anything) ── */}
      <Route path="/admin/*">
        <AdminGuard>
          <AdminLayout>
            <Switch>
              <Route path="/admin/employees" component={EmployeeList} />
              <Route path="/admin/employees/:id" component={EmployeeDetail} />
              <Route path="/admin/payroll" component={PayrollList} />
              <Route path="/admin/payroll/:id" component={PayrollDetail} />
              <Route path="/admin/leave" component={LeaveAdmin} />
              <Route path="/admin/timesheets" component={TimesheetAdmin} />
              <Route path="/admin/loans" component={LoansAdmin} />
              <Route path="/admin/reports" component={Reports} />
              <Route path="/admin/users" component={UsersAdmin} />
              <Route path="/admin/audit" component={AuditLog} />
              <Route path="/admin/billing" component={AdminBilling} />
              <Route path="/admin/filings" component={FilingsPage} />
              <Route path="/admin/settings" component={AdminSettings} />
              <Route><Redirect to="/admin" /></Route>
            </Switch>
          </AdminLayout>
        </AdminGuard>
      </Route>

      {/* ── Super-admin panel (exact /super) ── */}
      <Route path="/super">
        <SuperAdminGuard>
          <SuperAdminLayout>
            <SuperAdminCompanies />
          </SuperAdminLayout>
        </SuperAdminGuard>
      </Route>

      {/* ── Super-admin sub-pages (/super/anything) ── */}
      <Route path="/super/*">
        <SuperAdminGuard>
          <SuperAdminLayout>
            <Switch>
              <Route path="/super/billing" component={SuperAdminBilling} />
              <Route><Redirect to="/super" /></Route>
            </Switch>
          </SuperAdminLayout>
        </SuperAdminGuard>
      </Route>

      {/* ── Portal auth (outside guard) ── */}
      <Route path="/portal/login" component={PortalLogin} />

      {/* ── Portal dashboard (exact /portal) ── */}
      <Route path="/portal">
        <PortalGuard>
          <PortalLayout>
            <PortalProfile />
          </PortalLayout>
        </PortalGuard>
      </Route>

      {/* ── Portal sub-pages (/portal/anything) ── */}
      <Route path="/portal/*">
        <PortalGuard>
          <PortalLayout>
            <Switch>
              <Route path="/portal/leave" component={PortalLeave} />
              <Route path="/portal/loans" component={PortalLoans} />
              <Route path="/portal/p9" component={PortalP9} />
              <Route><Redirect to="/portal" /></Route>
            </Switch>
          </PortalLayout>
        </PortalGuard>
      </Route>

      {/* ── 404 ── */}
      <Route>
        <div className="flex items-center justify-center h-screen bg-background">
          <div className="text-center">
            <h1 className="text-4xl font-mono text-primary mb-2">404</h1>
            <p className="text-muted-foreground">ROUTE NOT FOUND</p>
          </div>
        </div>
      </Route>
    </Switch>
  );
}
