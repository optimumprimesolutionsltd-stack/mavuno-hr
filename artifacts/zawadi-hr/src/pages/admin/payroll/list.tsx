import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useListPayrollRuns, useCreatePayrollRun, getListPayrollRunsQueryKey, customFetch } from "@workspace/api-client-react";
import { formatMoney, formatPeriod, formatDateTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Wallet, Search, Loader2, Zap } from "lucide-react";

export function PayrollList() {
  const { data: runs, isLoading } = useListPayrollRuns();
  const createRun = useCreatePayrollRun();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const [offCycleOpen, setOffCycleOpen] = useState(false);

  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [runType, setRunType] = useState<"regular" | "off_cycle" | "bonus" | "final">("regular");

  // Off-cycle form state
  const [offCycleName, setOffCycleName] = useState("");
  const [offCyclePeriod, setOffCyclePeriod] = useState(new Date().toISOString().slice(0, 7));
  const [offCycleType, setOffCycleType] = useState<"bonus" | "termination" | "correction" | "other">("bonus");
  const [offCycleLoading, setOffCycleLoading] = useState(false);

  const handleCreate = () => {
    createRun.mutate(
      { data: { period, runType } },
      {
        onSuccess: () => {
          toast({ title: "Run Created", description: `Payroll run for ${period} created.` });
          queryClient.invalidateQueries({ queryKey: getListPayrollRunsQueryKey() });
          setOpen(false);
        },
        onError: (err: any) => {
          const msg = err?.data?.error || err?.message || "Failed to create payroll run.";
          toast({ variant: "destructive", title: "Error", description: msg });
        }
      }
    );
  };

  const handleOffCycleCreate = async () => {
    setOffCycleLoading(true);
    try {
      const result = await customFetch<{ run: { id: number } }>("/api/payroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: offCycleName.trim() || `Off-Cycle ${offCyclePeriod}`,
          period: offCyclePeriod,
          runType: "off_cycle",
        }),
      });
      toast({ title: "Off-Cycle Run Created", description: `Run "${offCycleName || offCyclePeriod}" created.` });
      queryClient.invalidateQueries({ queryKey: getListPayrollRunsQueryKey() });
      setOffCycleOpen(false);
      setOffCycleName("");
      setOffCycleType("bonus");
      if (result?.run?.id) {
        setLocation(`/admin/payroll/${result.run.id}`);
      }
    } catch (err: any) {
      const msg = err?.data?.error || err?.message || "Failed to create off-cycle run.";
      toast({ variant: "destructive", title: "Error", description: msg });
    } finally {
      setOffCycleLoading(false);
    }
  };

  const getStatusClass = (status: string): string => {
    switch (status) {
      case "draft":            return "border-muted-foreground/40 text-muted-foreground bg-muted/20";
      case "pending_approval": return "border-amber-500/60 text-amber-400 bg-amber-500/10";
      case "approved":         return "border-blue-500/60 text-blue-400 bg-blue-500/10";
      case "paid":             return "border-emerald-500/60 text-emerald-400 bg-emerald-500/10";
      case "reversed":         return "border-red-500/60 text-red-400 bg-red-500/10";
      default:                 return "border-muted-foreground/40 text-muted-foreground";
    }
  };

  return (
    <div className="space-y-6 max-w-[1200px] mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight font-mono">PAYROLL RUNS</h1>
          <p className="text-muted-foreground text-sm">Manage, review, and execute payroll batches</p>
        </div>

        <div className="flex items-center gap-2">
          {/* Off-Cycle Run Dialog */}
          <Dialog open={offCycleOpen} onOpenChange={setOffCycleOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="font-mono">
                <Zap className="h-4 w-4 mr-2" />
                OFF-CYCLE RUN
              </Button>
            </DialogTrigger>
            <DialogContent className="border-border/50 bg-card/95 backdrop-blur-sm sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="font-mono">Off-Cycle Payroll Run</DialogTitle>
                <DialogDescription>
                  Off-cycle runs let you pay bonuses, termination pay, or salary corrections outside your regular monthly cycle.
                  Select employees and run independently.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label className="font-mono text-xs text-muted-foreground">RUN NAME</Label>
                  <Input
                    value={offCycleName}
                    onChange={(e) => setOffCycleName(e.target.value)}
                    placeholder="e.g. Q1 Bonus, John Doe Final Dues"
                    className="font-mono"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="font-mono text-xs text-muted-foreground">PERIOD</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Select
                      value={offCyclePeriod.slice(0, 4)}
                      onValueChange={(y) => setOffCyclePeriod(`${y}-${offCyclePeriod.slice(5, 7)}`)}
                    >
                      <SelectTrigger className="font-mono"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 5 }, (_, i) => {
                          const y = String(new Date().getFullYear() - 1 + i);
                          return <SelectItem key={y} value={y}>{y}</SelectItem>;
                        })}
                      </SelectContent>
                    </Select>
                    <Select
                      value={offCyclePeriod.slice(5, 7)}
                      onValueChange={(m) => setOffCyclePeriod(`${offCyclePeriod.slice(0, 4)}-${m}`)}
                    >
                      <SelectTrigger className="font-mono"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["01","02","03","04","05","06","07","08","09","10","11","12"].map((m) => (
                          <SelectItem key={m} value={m}>
                            {new Date(`2000-${m}-01`).toLocaleString("en-KE", { month: "long" })}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="text-xs text-muted-foreground font-mono">Selected: {offCyclePeriod}</p>
                </div>

                <div className="space-y-2">
                  <Label className="font-mono text-xs text-muted-foreground">RUN TYPE</Label>
                  <Select value={offCycleType} onValueChange={(v: any) => setOffCycleType(v)}>
                    <SelectTrigger className="font-mono">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bonus">Bonus</SelectItem>
                      <SelectItem value="termination">Termination Pay</SelectItem>
                      <SelectItem value="correction">Salary Correction</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
                  Off-cycle runs follow the same <span className="font-mono text-foreground">Draft → Approve → Pay</span> flow.
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOffCycleOpen(false)}>Cancel</Button>
                <Button
                  className="font-mono"
                  onClick={handleOffCycleCreate}
                  disabled={offCycleLoading}
                >
                  {offCycleLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Zap className="h-4 w-4 mr-2" />}
                  CREATE RUN
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* New Payroll Run Dialog */}
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="font-mono">
                <Plus className="h-4 w-4 mr-2" />
                NEW PAYROLL RUN
              </Button>
            </DialogTrigger>
            <DialogContent className="border-border/50 bg-card/95 backdrop-blur-sm">
              <DialogHeader>
                <DialogTitle className="font-mono">INITIALIZE PAYROLL RUN</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label className="font-mono text-xs text-muted-foreground">PAYROLL PERIOD</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Select
                      value={period.slice(0, 4)}
                      onValueChange={(y) => setPeriod(`${y}-${period.slice(5, 7)}`)}
                    >
                      <SelectTrigger className="font-mono"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 5 }, (_, i) => {
                          const y = String(new Date().getFullYear() - 1 + i);
                          return <SelectItem key={y} value={y}>{y}</SelectItem>;
                        })}
                      </SelectContent>
                    </Select>
                    <Select
                      value={period.slice(5, 7)}
                      onValueChange={(m) => setPeriod(`${period.slice(0, 4)}-${m}`)}
                    >
                      <SelectTrigger className="font-mono"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["01","02","03","04","05","06","07","08","09","10","11","12"].map((m) => (
                          <SelectItem key={m} value={m}>
                            {new Date(`2000-${m}-01`).toLocaleString("en-KE", { month: "long" })}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="text-xs text-muted-foreground font-mono">Selected: {period}</p>
                </div>
                <div className="space-y-2">
                  <Label>Run Type</Label>
                  <Select value={runType} onValueChange={(v: any) => setRunType(v)}>
                    <SelectTrigger className="font-mono">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="regular">REGULAR</SelectItem>
                      <SelectItem value="off_cycle">OFF CYCLE</SelectItem>
                      <SelectItem value="bonus">BONUS</SelectItem>
                      <SelectItem value="final">FINAL DUES</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={handleCreate} className="w-full font-mono mt-4" disabled={createRun.isPending}>
                  {createRun.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Wallet className="h-4 w-4 mr-2" />}
                  INITIALIZE RUN
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="border border-border/50 rounded-lg overflow-hidden bg-card/30">
        <Table>
          <TableHeader className="bg-muted/30">
            <TableRow>
              <TableHead className="font-mono text-xs">PERIOD</TableHead>
              <TableHead className="font-mono text-xs">NAME</TableHead>
              <TableHead className="font-mono text-xs">TYPE</TableHead>
              <TableHead className="font-mono text-xs text-right">EMPLOYEES</TableHead>
              <TableHead className="font-mono text-xs text-right">NET TOTAL</TableHead>
              <TableHead className="font-mono text-xs text-right">STATUS</TableHead>
              <TableHead className="font-mono text-xs text-right">CREATED</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground font-mono">
                  LOADING PAYROLL RUNS...
                </TableCell>
              </TableRow>
            ) : !runs || runs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground font-mono">
                  NO PAYROLL RUNS FOUND
                </TableCell>
              </TableRow>
            ) : (
              runs.map((run) => (
                <TableRow key={run.id} className="group transition-colors hover:bg-muted/20">
                  <TableCell className="font-mono text-sm">
                    <Link href={`/admin/payroll/${run.id}`} className="hover:text-primary transition-colors font-bold">
                      {run.period}
                    </Link>
                  </TableCell>
                  <TableCell className="font-medium text-sm">
                    <Link href={`/admin/payroll/${run.id}`} className="hover:text-primary transition-colors">
                      {run.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs font-mono uppercase bg-muted px-2 py-1 rounded">{run.runType.replace('_', ' ')}</span>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {run.employeeCount}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm text-primary font-bold">
                    {formatMoney(run.netTotal)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant="outline" className={`font-mono text-[10px] py-0.5 ${getStatusClass(run.status)}`}>
                      {run.status.replace(/_/g, " ").toUpperCase()}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground font-mono">
                    {formatDateTime(run.createdAt)}
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
