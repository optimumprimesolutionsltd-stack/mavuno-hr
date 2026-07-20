import { useState } from "react";
import { useListLeaves, useDecideLeave, getListLeavesQueryKey, customFetch } from "@workspace/api-client-react";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { Check, X, Search, RotateCcw, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function LeaveAdmin() {
  const { data: leaves, isLoading } = useListLeaves();
  const decideLeave = useDecideLeave();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [resetDialogOpen, setResetDialogOpen] = useState(false);

  const handleDecision = (id: number, action: 'approve' | 'reject') => {
    decideLeave.mutate(
      { id, data: { action } },
      {
        onSuccess: () => {
          toast({ title: "Decision recorded", description: `Leave request ${action}d successfully.` });
          queryClient.invalidateQueries({ queryKey: getListLeavesQueryKey() });
        },
        onError: () => {
          toast({ variant: "destructive", title: "Error", description: "Failed to record decision." });
        }
      }
    );
  };

  const resetBalances = useMutation({
    mutationFn: () => customFetch("/api/leaves/reset-balances", { method: "POST" }),
    onSuccess: () => {
      toast({ title: "Balances reset", description: "All active employees' annual leave reset to 21 days." });
      queryClient.invalidateQueries({ queryKey: getListLeavesQueryKey() });
      setResetDialogOpen(false);
    },
    onError: (e: any) => {
      toast({ variant: "destructive", title: "Reset failed", description: e?.data?.error ?? e?.message });
      setResetDialogOpen(false);
    },
  });

  const filtered = leaves?.filter(r =>
    r.employee?.firstName?.toLowerCase().includes(search.toLowerCase()) ||
    r.employee?.lastName?.toLowerCase().includes(search.toLowerCase())
  ) || [];

  return (
    <div className="space-y-6 max-w-[1200px] mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight font-mono">LEAVE MANAGEMENT</h1>
          <p className="text-muted-foreground text-sm">Review and approve employee leave requests</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="font-mono gap-1.5 text-amber-400 border-amber-500/40 hover:bg-amber-500/10"
          onClick={() => setResetDialogOpen(true)}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          RESET FOR NEW YEAR
        </Button>
      </div>

      <div className="flex items-center gap-4 bg-card/50 p-4 rounded-lg border border-border/50">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by employee name..."
            className="pl-9 bg-background/50"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="border border-border/50 rounded-lg overflow-hidden bg-card/30">
        <Table>
          <TableHeader className="bg-muted/30">
            <TableRow>
              <TableHead className="font-mono text-xs">EMPLOYEE</TableHead>
              <TableHead className="font-mono text-xs">TYPE</TableHead>
              <TableHead className="font-mono text-xs">DATES</TableHead>
              <TableHead className="font-mono text-xs text-right">DAYS</TableHead>
              <TableHead className="font-mono text-xs text-right">BALANCE</TableHead>
              <TableHead className="font-mono text-xs text-center">STATUS</TableHead>
              <TableHead className="font-mono text-xs text-right">ACTIONS</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground font-mono">
                  LOADING LEAVE REQUESTS...
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground font-mono">
                  NO LEAVE REQUESTS FOUND
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((row) => {
                const remaining = (row as any).remainingBefore;
                return (
                  <TableRow key={row.leave.id} className="group transition-colors hover:bg-muted/20">
                    <TableCell>
                      <div className="font-medium text-sm">{row.employee.firstName} {row.employee.lastName}</div>
                      <div className="text-xs text-muted-foreground font-mono">{row.employee.empNo}</div>
                    </TableCell>
                    <TableCell>
                      <span className="capitalize text-sm">{row.leave.type}</span>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm font-mono">{formatDate(row.leave.startDate)}</div>
                      <div className="text-xs text-muted-foreground font-mono">to {formatDate(row.leave.endDate)}</div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {Math.round((row.leave.days ?? 0) / 10)}
                    </TableCell>
                    <TableCell className="text-right">
                      {row.leave.type === "annual" && remaining != null ? (
                        <span className={`font-mono text-sm font-medium ${remaining <= 3 ? "text-destructive" : remaining <= 7 ? "text-amber-400" : "text-primary"}`}>
                          {remaining}d
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={row.leave.status === 'pending' ? 'outline' : row.leave.status === 'approved' ? 'default' : 'destructive'} className="font-mono text-[10px]">
                        {row.leave.status.toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {row.leave.status === 'pending' ? (
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 w-8 p-0 text-destructive border-destructive hover:bg-destructive hover:text-destructive-foreground"
                            onClick={() => handleDecision(row.leave.id, 'reject')}
                            disabled={decideLeave.isPending}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 w-8 p-0 text-primary border-primary hover:bg-primary hover:text-primary-foreground"
                            onClick={() => handleDecision(row.leave.id, 'approve')}
                            disabled={decideLeave.isPending}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground font-mono">DECIDED</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Reset for New Year confirmation */}
      <AlertDialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-mono flex items-center gap-2">
              <RotateCcw className="h-4 w-4 text-amber-400" />
              RESET ANNUAL LEAVE BALANCES
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will reset the annual leave entitlement to <strong>21 days</strong> for <strong>all active employees</strong>.
              Use this at the start of a new leave year. The action is logged in the audit trail and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-mono">CANCEL</AlertDialogCancel>
            <AlertDialogAction
              className="font-mono bg-amber-500 hover:bg-amber-600 text-black"
              onClick={() => resetBalances.mutate()}
              disabled={resetBalances.isPending}
            >
              {resetBalances.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              CONFIRM RESET
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
