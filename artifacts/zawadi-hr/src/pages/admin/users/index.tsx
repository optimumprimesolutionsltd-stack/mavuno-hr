import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { useListEmployees } from "@workspace/api-client-react";
import {
  KeyRound, UserPlus, Eye, EyeOff, RefreshCw, Ban, CheckCircle2, Copy, Loader2, Shield
} from "lucide-react";
import { formatDate } from "@/lib/utils";

// ── API helpers ─────────────────────────────────────────────────────────────
function authHeaders() {
  const token = sessionStorage.getItem("sessionToken");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
}

async function apiGet(path: string) {
  const res = await fetch(path, { headers: authHeaders() as any });
  if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.error ?? `HTTP ${res.status}`); }
  return res.json();
}
async function apiPost(path: string, body: object) {
  const res = await fetch(path, { method: "POST", headers: authHeaders() as any, body: JSON.stringify(body) });
  if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.error ?? `HTTP ${res.status}`); }
  return res.json();
}
async function apiPatch(path: string, body: object) {
  const res = await fetch(path, { method: "PATCH", headers: authHeaders() as any, body: JSON.stringify(body) });
  if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.error ?? `HTTP ${res.status}`); }
  return res.json();
}

// ── Utilities ────────────────────────────────────────────────────────────────
function generatePassword(len = 12) {
  const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789@#!";
  return Array.from(crypto.getRandomValues(new Uint8Array(len))).map(b => chars[b % chars.length]).join("");
}

const ROLE_LABELS: Record<string, string> = {
  employee: "Employee",
  manager: "Manager",
  hr: "HR Officer",
  payroll_officer: "Payroll Officer",
  approver: "Approver",
  admin: "Administrator",
};

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-primary/10 text-primary border-primary/30",
  approver: "bg-purple-500/10 text-purple-400 border-purple-500/30",
  payroll_officer: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  hr: "bg-cyan-500/10 text-cyan-400 border-cyan-500/30",
  manager: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  employee: "bg-muted/60 text-muted-foreground border-border",
};

// ── Main component ────────────────────────────────────────────────────────────
export function UsersAdmin() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [resetTarget, setResetTarget] = useState<{ id: number; name: string } | null>(null);
  const [createdCreds, setCreatedCreds] = useState<{ email: string; password: string } | null>(null);
  const [newPw, setNewPw] = useState(() => generatePassword());
  const [showNewPw, setShowNewPw] = useState(false);

  const { data: users, isLoading } = useQuery({
    queryKey: ["/api/users"],
    queryFn: () => apiGet("/api/users"),
  });
  const { data: employees } = useListEmployees();

  // Unlinked employees (no user account yet)
  const linkedEmpIds = new Set((users ?? []).map((u: any) => u.employeeId).filter(Boolean));
  const unlinkedEmployees = (employees ?? []).filter(r => !linkedEmpIds.has(r.employee.id));

  // Create user mutation
  const createUser = useMutation({
    mutationFn: (data: object) => apiPost("/api/users", data),
    onSuccess: (result, vars: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setShowCreate(false);
      setCreatedCreds({ email: vars.email, password: vars.password });
    },
    onError: (err: any) => toast({ variant: "destructive", title: "Error", description: err.message }),
  });

  // Toggle disable mutation
  const toggleDisable = useMutation({
    mutationFn: ({ id, disabled }: { id: number; disabled: boolean }) =>
      apiPatch(`/api/users/${id}`, { disabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/users"] }),
    onError: (err: any) => toast({ variant: "destructive", title: "Error", description: err.message }),
  });

  // Change role mutation
  const changeRole = useMutation({
    mutationFn: ({ id, role }: { id: number; role: string }) =>
      apiPatch(`/api/users/${id}`, { role }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/users"] }),
    onError: (err: any) => toast({ variant: "destructive", title: "Error", description: err.message }),
  });

  // Reset password mutation
  const resetPassword = useMutation({
    mutationFn: ({ id, password }: { id: number; password: string }) =>
      apiPost(`/api/users/${id}/reset-password`, { password }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "Password reset", description: `New password set for ${resetTarget?.name}. Share it securely.` });
      setResetTarget(null);
      setNewPw(generatePassword());
    },
    onError: (err: any) => toast({ variant: "destructive", title: "Error", description: err.message }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight font-mono">ACCESS & LOGINS</h1>
          <p className="text-muted-foreground text-sm mt-1">Create and manage portal login accounts for employees</p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="font-mono">
          <UserPlus className="h-4 w-4 mr-2" />
          CREATE LOGIN
        </Button>
      </div>

      {/* Users table */}
      <Card className="border-border/50 bg-card/30">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead className="font-mono text-xs">USER</TableHead>
                <TableHead className="font-mono text-xs">LINKED EMPLOYEE</TableHead>
                <TableHead className="font-mono text-xs">ROLE</TableHead>
                <TableHead className="font-mono text-xs">LAST LOGIN</TableHead>
                <TableHead className="font-mono text-xs">STATUS</TableHead>
                <TableHead className="font-mono text-xs text-right">ACTIONS</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-12 text-muted-foreground font-mono">
                  <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                </TableCell></TableRow>
              ) : !users?.length ? (
                <TableRow><TableCell colSpan={6} className="text-center py-12 text-muted-foreground font-mono text-sm">
                  NO USERS YET — CREATE THE FIRST LOGIN ABOVE
                </TableCell></TableRow>
              ) : (
                (users as any[]).map((u) => (
                  <TableRow key={u.id} className={`group transition-colors ${u.disabledAt ? 'opacity-50' : 'hover:bg-muted/20'}`}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-mono text-xs font-bold border border-primary/20 shrink-0">
                          {u.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-medium text-sm">{u.name}</div>
                          <div className="text-xs text-muted-foreground font-mono">{u.email}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {u.employeeName
                        ? <div>
                            <div className="text-sm">{u.employeeName}</div>
                            <div className="text-xs text-muted-foreground font-mono">{u.empNo}</div>
                          </div>
                        : <span className="text-xs text-muted-foreground font-mono italic">No employee link</span>}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={u.role}
                        onValueChange={(role) => changeRole.mutate({ id: u.id, role })}
                      >
                        <SelectTrigger className={`h-7 w-[140px] text-xs font-mono border rounded-md px-2 ${ROLE_COLORS[u.role] ?? ''}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(ROLE_LABELS).map(([v, l]) => (
                            <SelectItem key={v} value={v} className="text-xs font-mono">{l}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {u.lastLoginAt ? formatDate(u.lastLoginAt) : <span className="italic">Never</span>}
                    </TableCell>
                    <TableCell>
                      {u.mustChangePassword && !u.disabledAt && (
                        <Badge variant="outline" className="font-mono text-[10px] text-amber-400 border-amber-400/30 bg-amber-400/5">
                          MUST CHANGE PW
                        </Badge>
                      )}
                      {u.disabledAt && (
                        <Badge variant="destructive" className="font-mono text-[10px]">DISABLED</Badge>
                      )}
                      {!u.disabledAt && !u.mustChangePassword && (
                        <Badge variant="outline" className="font-mono text-[10px] text-emerald-400 border-emerald-400/30 bg-emerald-400/5">
                          ACTIVE
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost" size="sm"
                          className="h-7 px-2 font-mono text-xs"
                          onClick={() => { setResetTarget({ id: u.id, name: u.name }); setNewPw(generatePassword()); }}
                        >
                          <RefreshCw className="h-3 w-3 mr-1" /> Reset PW
                        </Button>
                        <Button
                          variant="ghost" size="sm"
                          className={`h-7 px-2 font-mono text-xs ${u.disabledAt ? 'text-emerald-400' : 'text-destructive'}`}
                          onClick={() => toggleDisable.mutate({ id: u.id, disabled: !u.disabledAt })}
                        >
                          {u.disabledAt
                            ? <><CheckCircle2 className="h-3 w-3 mr-1" />Enable</>
                            : <><Ban className="h-3 w-3 mr-1" />Disable</>}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create Login Dialog */}
      <CreateLoginDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        employees={unlinkedEmployees}
        onSubmit={(data) => createUser.mutate(data)}
        isPending={createUser.isPending}
      />

      {/* Reset Password Dialog */}
      <Dialog open={!!resetTarget} onOpenChange={(v) => !v && setResetTarget(null)}>
        <DialogContent className="max-w-md bg-card border-border/60">
          <DialogHeader>
            <DialogTitle className="font-mono">RESET PASSWORD</DialogTitle>
            <DialogDescription>Set a new temporary password for <strong>{resetTarget?.name}</strong>. They will be required to change it on next login.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs font-mono text-muted-foreground">NEW TEMPORARY PASSWORD</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    type={showNewPw ? "text" : "password"}
                    value={newPw}
                    onChange={e => setNewPw(e.target.value)}
                    className="font-mono pr-10 bg-background/50"
                  />
                  <button onClick={() => setShowNewPw(v => !v)} className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground">
                    {showNewPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <Button variant="outline" size="sm" onClick={() => setNewPw(generatePassword())} title="Generate new password">
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
          <div className="flex justify-between pt-2 border-t border-border/30">
            <Button variant="outline" onClick={() => setResetTarget(null)} className="font-mono">CANCEL</Button>
            <Button
              onClick={() => resetPassword.mutate({ id: resetTarget!.id, password: newPw })}
              disabled={resetPassword.isPending || !newPw}
              className="font-mono"
            >
              {resetPassword.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Shield className="h-4 w-4 mr-2" />}
              SET PASSWORD
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Credentials reveal dialog */}
      {createdCreds && (
        <Dialog open onOpenChange={() => setCreatedCreds(null)}>
          <DialogContent className="max-w-md bg-card border-border/60">
            <DialogHeader>
              <DialogTitle className="font-mono text-emerald-400">✓ LOGIN CREATED</DialogTitle>
              <DialogDescription>Share these credentials with the employee securely. The password will NOT be shown again.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="p-4 rounded-lg bg-muted/30 border border-border/50 font-mono text-sm space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground text-xs">LOGIN URL</span>
                  <code className="text-xs">{window.location.origin}/portal/login</code>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground text-xs">EMAIL</span>
                  <code className="text-primary">{createdCreds.email}</code>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground text-xs">TEMP PASSWORD</span>
                  <code className="text-primary font-bold">{createdCreds.password}</code>
                </div>
              </div>
              <Button
                variant="outline"
                className="w-full font-mono text-xs"
                onClick={() => {
                  navigator.clipboard.writeText(`Portal: ${window.location.origin}/portal/login\nEmail: ${createdCreds.email}\nPassword: ${createdCreds.password}`);
                }}
              >
                <Copy className="h-4 w-4 mr-2" /> COPY CREDENTIALS
              </Button>
              <p className="text-xs text-muted-foreground text-center font-mono">
                Employee will be asked to set a new password on first login.
              </p>
            </div>
            <Button onClick={() => setCreatedCreds(null)} className="w-full font-mono mt-2">DONE</Button>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ── Create Login Dialog ───────────────────────────────────────────────────────
function CreateLoginDialog({
  open, onOpenChange, employees, onSubmit, isPending,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  employees: any[];
  onSubmit: (data: any) => void;
  isPending: boolean;
}) {
  const [empId, setEmpId] = useState("__none__");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("employee");
  const [password, setPassword] = useState(() => generatePassword());
  const [showPw, setShowPw] = useState(false);

  // Auto-fill name/email when employee is selected
  const handleEmpChange = (val: string) => {
    setEmpId(val);
    if (val === "__none__") { setName(""); setEmail(""); return; }
    const row = employees.find(r => String(r.employee.id) === val);
    if (row) {
      setName(`${row.employee.firstName} ${row.employee.lastName}`);
      setEmail(row.employee.email ?? "");
    }
  };

  const reset = () => { setEmpId("__none__"); setName(""); setEmail(""); setRole("employee"); setPassword(generatePassword()); setShowPw(false); };
  const close = () => { onOpenChange(false); reset(); };

  const submit = () => {
    if (!name || !email || !password) return;
    onSubmit({
      email,
      name,
      role,
      employeeId: empId !== "__none__" ? Number(empId) : undefined,
      password,
      mustChangePassword: true,
    });
    close();
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-lg bg-card border-border/60">
        <DialogHeader>
          <DialogTitle className="font-mono flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-primary" /> CREATE LOGIN ACCOUNT
          </DialogTitle>
          <DialogDescription>
            Create a portal login for an employee. They'll use this to access payslips, leave, and loans.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 py-2">
          <div className="col-span-2 space-y-1">
            <Label className="text-xs font-mono text-muted-foreground">LINK TO EMPLOYEE (optional)</Label>
            <Select value={empId} onValueChange={handleEmpChange}>
              <SelectTrigger className="bg-background/50"><SelectValue placeholder="Select employee to auto-fill..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— No employee link (admin/standalone user) —</SelectItem>
                {employees.map(r => (
                  <SelectItem key={r.employee.id} value={String(r.employee.id)}>
                    {r.employee.firstName} {r.employee.lastName} ({r.employee.empNo})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-mono text-muted-foreground">FULL NAME *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Jane Wanjiku" className="bg-background/50" />
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-mono text-muted-foreground">WORK EMAIL *</Label>
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="jane@company.com" className="bg-background/50" />
          </div>

          <div className="col-span-2 space-y-1">
            <Label className="text-xs font-mono text-muted-foreground">SYSTEM ROLE</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger className="bg-background/50"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(ROLE_LABELS).map(([v, l]) => (
                  <SelectItem key={v} value={v}><span className="font-mono text-sm">{l}</span></SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground font-mono mt-1">
              {role === "employee" && "Can view own payslips, request leave, see loans."}
              {role === "manager" && "Employee access + can approve team leave."}
              {role === "hr" && "Full employee management, leave admin."}
              {role === "payroll_officer" && "Can calculate and submit payroll runs."}
              {role === "approver" && "Can approve and disburse payroll. Cannot calculate."}
              {role === "admin" && "Full system access."}
            </p>
          </div>

          <div className="col-span-2 space-y-1">
            <Label className="text-xs font-mono text-muted-foreground">TEMPORARY PASSWORD *</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="font-mono pr-10 bg-background/50"
                />
                <button onClick={() => setShowPw(v => !v)} className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground">
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <Button variant="outline" size="sm" onClick={() => setPassword(generatePassword())} title="Generate new password">
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground font-mono">Employee must change this on first login.</p>
          </div>
        </div>

        <div className="flex justify-between pt-2 border-t border-border/30">
          <Button variant="outline" onClick={close} className="font-mono">CANCEL</Button>
          <Button onClick={submit} disabled={isPending || !name || !email || !password} className="font-mono">
            {isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <UserPlus className="h-4 w-4 mr-2" />}
            CREATE LOGIN
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
