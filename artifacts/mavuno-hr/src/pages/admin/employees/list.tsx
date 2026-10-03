import { useState, useMemo } from "react";
import { Link } from "wouter";
import { useListEmployees, getListEmployeesQueryKey } from "@workspace/api-client-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { formatMoney, fullName } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, UserPlus, MoreHorizontal, FileSpreadsheet, Building2, Download, X, SlidersHorizontal, ChevronDown, RotateCcw, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { downloadEmployeesXlsx } from "@/lib/itax-csv";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { OnboardDialog } from "./onboard-dialog";
import { ImportDialog } from "./import-dialog";
import { EditEmployeeDialog } from "./edit-dialog";

const EDUCATION_LEVELS: { value: string; label: string }[] = [
  { value: "none",        label: "No Formal Education" },
  { value: "primary",     label: "Primary" },
  { value: "secondary",   label: "Secondary / O-Level" },
  { value: "certificate", label: "Certificate" },
  { value: "diploma",     label: "Diploma" },
  { value: "bachelor",    label: "Bachelor's Degree" },
  { value: "master",      label: "Master's Degree" },
  { value: "phd",         label: "PhD / Doctorate" },
  { value: "other",       label: "Other" },
];

export function EmployeeList() {
  const { data: employees, isLoading } = useListEmployees({ includeTerminated: true });
  const queryClient = useQueryClient();
  const { data: departments = [] } = useQuery<any[]>({ queryKey: ["/api/departments"], queryFn: () => customFetch("/api/departments") as Promise<any[]> });
  const [showDepartments, setShowDepartments] = useState(false);
  const [departmentName, setDepartmentName] = useState("");
  const [departmentCode, setDepartmentCode] = useState("");
  const addDepartment = useMutation({
    mutationFn: () => customFetch("/api/departments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: departmentName, code: departmentCode }) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/departments"] }); setDepartmentName(""); setDepartmentCode(""); },
  });
  const [search, setSearch] = useState("");
  // Terminated and suspended people stay on file (documents included) but sit
  // on their own tabs so the default view is the current workforce.
  const [statusTab, setStatusTab] = useState<"active" | "suspended" | "terminated" | "all">("active");
  const [filterRegion, setFilterRegion] = useState<string>("");
  const [filterEducation, setFilterEducation] = useState<string>("");
  const [onboarding, setOnboarding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [editEmployee, setEditEmployee] = useState<any | null>(null);
  const [exportingAll, setExportingAll] = useState(false);
  const { toast } = useToast();
  // Reinstating straight from the list: someone terminated while catching up
  // on earlier months often turns out to be needed again in the current run.
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [toReinstate, setToReinstate] = useState<any[] | null>(null);
  const reinstate = useMutation({
    mutationFn: async (people: any[]) => {
      const failed: string[] = [];
      for (const e of people) {
        try { await customFetch(`/api/employees/${e.id}/reinstate`, { method: "POST" }); }
        catch (err: any) { failed.push(`${fullName(e)}: ${err?.data?.error ?? err?.message ?? "failed"}`); }
      }
      return { done: people.length - failed.length, failed };
    },
    onSuccess: ({ done, failed }) => {
      queryClient.invalidateQueries({ queryKey: getListEmployeesQueryKey() });
      setPicked(new Set());
      setToReinstate(null);
      if (done) toast({
        title: `${done} employee${done === 1 ? "" : "s"} reinstated`,
        description: "They are active again. Open a draft payroll run and click Recalculate to add them to it.",
      });
      if (failed.length) toast({ variant: "destructive", title: "Some could not be reinstated", description: failed.join("; ") });
    },
  });
  const togglePick = (id: number) => setPicked((cur) => {
    const next = new Set(cur);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  // Derive unique non-empty regions from the loaded list
  const regionOptions = useMemo(() => {
    const seen = new Set<string>();
    employees?.forEach(r => { if (r.employee.region) seen.add(r.employee.region); });
    return Array.from(seen).sort();
  }, [employees]);

  const statusCounts = useMemo(() => {
    const c = { active: 0, suspended: 0, terminated: 0, all: 0 };
    (employees ?? []).forEach(r => {
      c.all++;
      if (r.employee.status === "terminated") c.terminated++;
      else if (r.employee.status === "suspended") c.suspended++;
      else c.active++;
    });
    return c;
  }, [employees]);

  const filtered = useMemo(() => (employees ?? []).filter(r => {
    const st = r.employee.status;
    if (statusTab === "active" && (st === "terminated" || st === "suspended")) return false;
    if (statusTab === "suspended" && st !== "suspended") return false;
    if (statusTab === "terminated" && st !== "terminated") return false;
    const q = search.toLowerCase();
    if (q && !(
      fullName(r.employee).toLowerCase().includes(q) ||
      r.employee.middleName?.toLowerCase().includes(q) ||
      r.employee.empNo.toLowerCase().includes(q) ||
      r.employee.email.toLowerCase().includes(q)
    )) return false;
    if (filterRegion && r.employee.region !== filterRegion) return false;
    if (filterEducation && r.employee.educationLevel !== filterEducation) return false;
    return true;
  }), [employees, search, filterRegion, filterEducation, statusTab]);

  const hasActiveFilters = !!filterRegion || !!filterEducation;

  function clearFilters() {
    setFilterRegion("");
    setFilterEducation("");
  }

  return (
    <div className="space-y-6 max-w-[1200px] mx-auto">
      <OnboardDialog open={onboarding} onOpenChange={setOnboarding} />
      <ImportDialog open={importing} onOpenChange={setImporting} />
      <EditEmployeeDialog
        employee={editEmployee}
        open={!!editEmployee}
        onOpenChange={(v) => { if (!v) setEditEmployee(null); }}
      />

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold uppercase leading-none">EMPLOYEES</h1>
          <p className="text-muted-foreground text-sm">Manage staff roster and payroll details</p>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="font-mono"
              >
                <Download className="h-4 w-4 mr-2" />
                EXPORT
                <ChevronDown className="h-3.5 w-3.5 ml-1.5 opacity-70" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="font-mono text-xs">
              <DropdownMenuItem
                disabled={!employees || employees.length === 0}
                onSelect={() => {
                  if (!employees) return;
                  const today = new Date().toISOString().slice(0, 10);
                  downloadEmployeesXlsx((employees as any[]).filter(r => r.employee.status !== "terminated"), `employees_active_${today}.xlsx`);
                }}
              >
                Export Active
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={exportingAll}
                onSelect={async () => {
                  setExportingAll(true);
                  try {
                    const all = await customFetch("/api/employees?includeTerminated=true") as any[];
                    const today = new Date().toISOString().slice(0, 10);
                    await downloadEmployeesXlsx(all, `employees_all_${today}.xlsx`);
                  } finally {
                    setExportingAll(false);
                  }
                }}
              >
                {exportingAll ? "Exporting…" : "Export All (incl. terminated)"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" className="font-mono" onClick={() => setImporting(true)}>
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            IMPORT
          </Button>
          <Button className="font-mono" onClick={() => setOnboarding(true)}>
            <UserPlus className="h-4 w-4 mr-2" />
            ONBOARD EMPLOYEE
          </Button>
        </div>
      </div>

      {/* The headcount by status, ruled like a register, and each cell is the
          tab that filters the table below. */}
      <div role="tablist" aria-label="Employees by status" className="grid grid-cols-2 sm:grid-cols-4 border-2 border-foreground bg-card">
        {([
          ["active", "Active"], ["suspended", "Suspended"], ["terminated", "Terminated"], ["all", "All"],
        ] as const).map(([key, label], i) => {
          const on = statusTab === key;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => { setStatusTab(key); setPicked(new Set()); }}
              className={`min-w-0 p-3 sm:p-4 text-left transition-colors ${on ? "bg-foreground text-background" : "hover:bg-muted"} ${i % 2 === 1 ? "border-l border-border" : ""} ${i >= 2 ? "border-t sm:border-t-0 border-border" : ""} ${i === 2 ? "sm:border-l" : ""}`}
            >
              <span className={`block font-mono text-[11px] uppercase tracking-[0.08em] ${on ? "text-background/70" : "text-muted-foreground"}`}>{label}</span>
              <span className="mt-1 block font-mono text-2xl font-medium tabular-nums">{statusCounts[key]}</span>
            </button>
          );
        })}
      </div>

      {statusTab === "terminated" && statusCounts.terminated > 0 && (
        <div className="flex flex-wrap items-center gap-3 text-sm bg-card p-3 rounded-lg border border-border">
          <span className="text-muted-foreground">
            Tick the people you need back, or use Reinstate on a row. Their employee number, history and settings are kept.
          </span>
          <Button
            size="sm" className="font-mono gap-1.5 ml-auto" disabled={picked.size === 0}
            onClick={() => setToReinstate(filtered.filter((r) => picked.has(r.employee.id)).map((r) => r.employee))}
          >
            <RotateCcw className="h-3.5 w-3.5" /> REINSTATE SELECTED ({picked.size})
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-3 bg-card p-4 rounded-lg border border-border">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, employee number, or email..."
              className="pl-9 bg-background/50"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Region filter */}
          <div className="flex items-center gap-1.5">
            <SlidersHorizontal className="h-4 w-4 text-muted-foreground shrink-0" />
            <Select value={filterRegion} onValueChange={setFilterRegion}>
              <SelectTrigger className="w-[160px] font-mono text-xs h-9">
                <SelectValue placeholder="ALL REGIONS" />
              </SelectTrigger>
              <SelectContent>
                {regionOptions.length === 0 ? (
                  <SelectItem value="_none" disabled>No regions recorded</SelectItem>
                ) : (
                  regionOptions.map(r => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Education level filter */}
          <Select value={filterEducation} onValueChange={setFilterEducation}>
            <SelectTrigger className="w-[190px] font-mono text-xs h-9">
              <SelectValue placeholder="ALL EDUCATION LEVELS" />
            </SelectTrigger>
            <SelectContent>
              {EDUCATION_LEVELS.map(e => (
                <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {hasActiveFilters && (
            <Button variant="ghost" size="sm" className="font-mono text-xs h-9 text-muted-foreground hover:text-foreground" onClick={clearFilters}>
              <X className="h-3.5 w-3.5 mr-1" /> CLEAR
            </Button>
          )}

          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" className="font-mono text-xs h-9" onClick={() => setShowDepartments(v => !v)}>
              <Building2 className="h-4 w-4 mr-2" /> DEPARTMENTS
            </Button>
            <span className="text-sm text-muted-foreground font-mono whitespace-nowrap">
              {filtered.length} RECORDS
            </span>
          </div>
        </div>

        {/* Active filter chips */}
        {hasActiveFilters && (
          <div className="flex flex-wrap gap-2">
            {filterRegion && (
              <Badge variant="secondary" className="font-mono text-xs gap-1 pr-1 cursor-pointer" onClick={() => setFilterRegion("")}>
                REGION: {filterRegion}
                <X className="h-3 w-3 ml-0.5" />
              </Badge>
            )}
            {filterEducation && (
              <Badge variant="secondary" className="font-mono text-xs gap-1 pr-1 cursor-pointer" onClick={() => setFilterEducation("")}>
                EDU: {EDUCATION_LEVELS.find(e => e.value === filterEducation)?.label ?? filterEducation}
                <X className="h-3 w-3 ml-0.5" />
              </Badge>
            )}
          </div>
        )}
      </div>
      {showDepartments && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between"><h2 className="font-mono font-semibold">DEPARTMENTS</h2><span className="text-xs text-muted-foreground">{departments.length} total</span></div>
          <div className="flex flex-wrap gap-2">{departments.map((d) => <Badge key={d.id} variant="outline">{d.name} · {d.code}</Badge>)}</div>
          <div className="flex gap-2 max-w-xl">
            <Input placeholder="Department name" value={departmentName} onChange={(e) => setDepartmentName(e.target.value)} />
            <Input placeholder="Code" value={departmentCode} onChange={(e) => setDepartmentCode(e.target.value.toUpperCase())} className="max-w-32" />
            <Button disabled={!departmentName.trim() || !departmentCode.trim() || addDepartment.isPending} onClick={() => addDepartment.mutate()}>ADD</Button>
          </div>
        </div>
      )}

      <div className="border border-border border-t-2 border-t-foreground overflow-hidden bg-card">
        <Table>
          <TableHeader className="bg-muted">
            <TableRow>
              {statusTab === "terminated" && (
                <TableHead className="w-[40px]">
                  <input
                    type="checkbox" className="h-4 w-4" aria-label="Select all"
                    checked={filtered.length > 0 && filtered.every((r) => picked.has(r.employee.id))}
                    onChange={(e) => setPicked(e.target.checked ? new Set(filtered.map((r) => r.employee.id)) : new Set())}
                  />
                </TableHead>
              )}
              <TableHead className="w-[100px] font-mono text-xs">EMP NO</TableHead>
              <TableHead>EMPLOYEE</TableHead>
              <TableHead>POSITION</TableHead>
              <TableHead>STATUS</TableHead>
              <TableHead className="text-right">BASIC SALARY</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={statusTab === "terminated" ? 7 : 6} className="text-center py-8 text-muted-foreground font-mono">
                  LOADING ROSTER...
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={statusTab === "terminated" ? 7 : 6} className="text-center py-8 text-muted-foreground font-mono">
                  NO EMPLOYEES FOUND
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((row) => (
                <TableRow key={row.employee.id} className="group transition-colors hover:bg-muted/20">
                  {statusTab === "terminated" && (
                    <TableCell>
                      <input
                        type="checkbox" className="h-4 w-4" aria-label={`Select ${fullName(row.employee)}`}
                        checked={picked.has(row.employee.id)} onChange={() => togglePick(row.employee.id)}
                      />
                    </TableCell>
                  )}
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    <Link href={`/admin/employees/${row.employee.id}`} className="hover:text-primary transition-colors">
                      {row.employee.empNo}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-[2px] bg-foreground text-background flex items-center justify-center font-mono font-medium text-xs shrink-0">
                        {row.employee.firstName.charAt(0)}{row.employee.lastName.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium">
                          <Link href={`/admin/employees/${row.employee.id}`} className="hover:text-primary transition-colors">
                            {fullName(row.employee)}
                          </Link>
                        </div>
                        <div className="text-xs text-muted-foreground truncate">{row.employee.email}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">{row.employee.position}</div>
                    <div className="text-xs text-muted-foreground">{row.department?.name || 'No Dept'}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={row.employee.status === 'active' ? 'default' : row.employee.status === 'terminated' ? 'destructive' : 'secondary'} className="font-mono text-[10px] py-0">
                      {row.employee.status.toUpperCase()}
                    </Badge>
                    {row.employee.status === "terminated" && row.employee.terminationDate && (
                      <div className="text-[11px] text-muted-foreground font-mono mt-1">left {row.employee.terminationDate}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm text-primary">
                    {formatMoney(row.employee.basicSalary)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                    {row.employee.status === "terminated" && (
                      <Button
                        size="sm" variant="outline" className="h-8 font-mono text-xs gap-1"
                        onClick={() => setToReinstate([row.employee])}
                      >
                        <RotateCcw className="h-3.5 w-3.5" /> REINSTATE
                      </Button>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/admin/employees/${row.employee.id}`}>View Profile</Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setEditEmployee(row.employee)}>
                          Edit Details
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={!!toReinstate} onOpenChange={(o) => { if (!o && !reinstate.isPending) setToReinstate(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-mono">
              Reinstate {toReinstate?.length === 1 ? fullName(toReinstate[0]) : `${toReinstate?.length} employees`}?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                {toReinstate && toReinstate.length > 1 && (
                  <ul className="list-disc pl-5">{toReinstate.map((e) => <li key={e.id}>{fullName(e)} ({e.empNo})</li>)}</ul>
                )}
                <p>
                  They become active again with the same employee number, salary, loans and history. The termination
                  date and reason are cleared, so they are included in every payroll run from now on.
                </p>
                <p>
                  A draft run that already exists does not update by itself: open it and click <strong>Recalculate</strong>.
                  Paid runs are not changed.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={reinstate.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={reinstate.isPending}
              onClick={(e) => { e.preventDefault(); if (toReinstate) reinstate.mutate(toReinstate); }}
            >
              {reinstate.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              Reinstate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
