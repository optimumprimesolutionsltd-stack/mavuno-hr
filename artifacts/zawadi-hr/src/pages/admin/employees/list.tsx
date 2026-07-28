import { useState } from "react";
import { Link } from "wouter";
import { useListEmployees } from "@workspace/api-client-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { formatMoney, fullName } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search, UserPlus, MoreHorizontal, FileSpreadsheet, Building2, Download } from "lucide-react";
import { downloadEmployeesCsv } from "@/lib/itax-csv";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { OnboardDialog } from "./onboard-dialog";
import { ImportDialog } from "./import-dialog";
import { EditEmployeeDialog } from "./edit-dialog";

export function EmployeeList() {
  const { data: employees, isLoading } = useListEmployees();
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
  const [onboarding, setOnboarding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [editEmployee, setEditEmployee] = useState<any | null>(null);

  const filtered = employees?.filter(r =>
    fullName(r.employee).toLowerCase().includes(search.toLowerCase()) ||
    r.employee.middleName?.toLowerCase().includes(search.toLowerCase()) ||
    r.employee.empNo.toLowerCase().includes(search.toLowerCase()) ||
    r.employee.email.toLowerCase().includes(search.toLowerCase())
  ) || [];

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
          <h1 className="text-2xl font-bold tracking-tight font-mono">EMPLOYEES</h1>
          <p className="text-muted-foreground text-sm">Manage staff roster and payroll details</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="font-mono"
            disabled={!employees || employees.length === 0}
            onClick={() => {
              if (!employees) return;
              const today = new Date().toISOString().slice(0, 10);
              downloadEmployeesCsv(employees as any[], `employees_${today}.csv`);
            }}
          >
            <Download className="h-4 w-4 mr-2" />
            EXPORT
          </Button>
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

      <div className="flex items-center gap-4 bg-card/50 p-4 rounded-lg border border-border/50">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, employee number, or email..."
            className="pl-9 bg-background/50"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
          <Button variant="outline" className="font-mono" onClick={() => setShowDepartments(v => !v)}>
            <Building2 className="h-4 w-4 mr-2" /> DEPARTMENTS
          </Button>
        <div className="text-sm text-muted-foreground font-mono">
          {filtered.length} RECORDS
        </div>
      </div>
      {showDepartments && (
        <div className="rounded-lg border border-border/50 bg-card/30 p-4 space-y-3">
          <div className="flex items-center justify-between"><h2 className="font-mono font-semibold">DEPARTMENTS</h2><span className="text-xs text-muted-foreground">{departments.length} total</span></div>
          <div className="flex flex-wrap gap-2">{departments.map((d) => <Badge key={d.id} variant="outline">{d.name} · {d.code}</Badge>)}</div>
          <div className="flex gap-2 max-w-xl">
            <Input placeholder="Department name" value={departmentName} onChange={(e) => setDepartmentName(e.target.value)} />
            <Input placeholder="Code" value={departmentCode} onChange={(e) => setDepartmentCode(e.target.value.toUpperCase())} className="max-w-32" />
            <Button disabled={!departmentName.trim() || !departmentCode.trim() || addDepartment.isPending} onClick={() => addDepartment.mutate()}>ADD</Button>
          </div>
        </div>
      )}

      <div className="border border-border/50 rounded-lg overflow-hidden bg-card/30">
        <Table>
          <TableHeader className="bg-muted/30">
            <TableRow>
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
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground font-mono">
                  LOADING ROSTER...
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground font-mono">
                  NO EMPLOYEES FOUND
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((row) => (
                <TableRow key={row.employee.id} className="group transition-colors hover:bg-muted/20">
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    <Link href={`/admin/employees/${row.employee.id}`} className="hover:text-primary transition-colors">
                      {row.employee.empNo}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs border border-primary/20 shrink-0">
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
                    <Badge variant={row.employee.status === 'active' ? 'default' : 'secondary'} className="font-mono text-[10px] py-0">
                      {row.employee.status.toUpperCase()}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm text-primary">
                    {formatMoney(row.employee.basicSalary)}
                  </TableCell>
                  <TableCell>
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
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
