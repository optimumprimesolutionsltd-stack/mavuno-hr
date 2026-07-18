import { useState } from "react";
import { Link } from "wouter";
import { useListPayrollRuns, useCreatePayrollRun, getListPayrollRunsQueryKey } from "@workspace/api-client-react";
import { formatMoney, formatPeriod, formatDateTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Wallet, Search, Loader2 } from "lucide-react";

export function PayrollList() {
  const { data: runs, isLoading } = useListPayrollRuns();
  const createRun = useCreatePayrollRun();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [runType, setRunType] = useState<"regular" | "off_cycle" | "bonus" | "final">("regular");

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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft': return 'secondary';
      case 'pending_approval': return 'default';
      case 'approved': return 'default';
      case 'paid': return 'default'; // Maybe a special class for paid
      default: return 'outline';
    }
  };

  return (
    <div className="space-y-6 max-w-[1200px] mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight font-mono">PAYROLL RUNS</h1>
          <p className="text-muted-foreground text-sm">Manage, review, and execute payroll batches</p>
        </div>
        
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
                    <Badge variant={getStatusColor(run.status) as any} className={`font-mono text-[10px] py-0 ${run.status === 'paid' ? 'bg-primary text-primary-foreground' : ''}`}>
                      {run.status.replace('_', ' ').toUpperCase()}
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
