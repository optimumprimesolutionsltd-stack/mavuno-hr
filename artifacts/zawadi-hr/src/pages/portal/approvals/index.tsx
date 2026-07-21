import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Check, X, XCircle, Loader2, ClipboardList, CheckCircle } from "lucide-react";

const PENDING_LEAVES_KEY = ["portal", "pending-leaves"];

function leaveStatusBadge(status: string) {
  if (status === "approved")
    return <Badge className="font-mono text-[10px] bg-emerald-500/20 text-emerald-400 border-emerald-500/30">APPROVED</Badge>;
  if (status === "rejected")
    return <Badge variant="destructive" className="font-mono text-[10px]">REJECTED</Badge>;
  if (status === "cancelled")
    return <Badge variant="outline" className="font-mono text-[10px] text-muted-foreground">CANCELLED</Badge>;
  return <Badge variant="outline" className="font-mono text-[10px] text-amber-400 border-amber-400/40">PENDING</Badge>;
}

export function PortalApprovals() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [cancelTarget, setCancelTarget] = useState<number | null>(null);
  const [decidingId, setDecidingId] = useState<number | null>(null);

  // Roles that can cancel approved leaves
  const canCancel = user?.role === "admin" || user?.role === "hr";

  const { data: rows = [], isLoading } = useQuery({
    queryKey: PENDING_LEAVES_KEY,
    queryFn: () => customFetch<any[]>("/api/portal/pending-leaves"),
  });

  const pending = (rows as any[]).filter((r) => r.leave.status === "pending");
  const decided = (rows as any[]).filter((r) => r.leave.status !== "pending");

  const decide = useMutation({
    mutationFn: ({ id, action }: { id: number; action: "approve" | "reject" }) =>
      customFetch(`/api/leaves/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      }),
    onSuccess: (_data, vars) => {
      toast({
        title: vars.action === "approve" ? "Leave approved" : "Leave rejected",
        description: `Request has been ${vars.action}d successfully.`,
      });
      queryClient.invalidateQueries({ queryKey: PENDING_LEAVES_KEY });
      setDecidingId(null);
    },
    onError: (err: any, vars) => {
      const msg = err?.data?.error ?? err?.message ?? `Failed to ${vars.action} leave.`;
      toast({ variant: "destructive", title: "Error", description: msg });
      setDecidingId(null);
    },
  });

  const cancelLeave = useMutation({
    mutationFn: (id: number) =>
      customFetch(`/api/leaves/${id}/cancel`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: () => {
      toast({ title: "Leave cancelled", description: "The approved leave has been cancelled." });
      queryClient.invalidateQueries({ queryKey: PENDING_LEAVES_KEY });
      setCancelTarget(null);
    },
    onError: (err: any) => {
      const msg = err?.data?.error ?? err?.message ?? "Failed to cancel leave.";
      toast({ variant: "destructive", title: "Error", description: msg });
      setCancelTarget(null);
    },
  });

  const handleDecide = (id: number, action: "approve" | "reject") => {
    setDecidingId(id);
    decide.mutate({ id, action });
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight font-mono">LEAVE APPROVALS</h1>
        <p className="text-muted-foreground text-sm">Review and action employee leave requests</p>
      </div>

      {/* Summary chips */}
      <div className="flex gap-3 flex-wrap">
        <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 font-mono text-sm">
          <ClipboardList className="h-4 w-4" />
          <span className="font-bold">{pending.length}</span> pending
        </div>
        <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-mono text-sm">
          <CheckCircle className="h-4 w-4" />
          <span className="font-bold">{decided.filter((r) => r.leave.status === "approved").length}</span> approved
        </div>
      </div>

      <Tabs defaultValue="pending">
        <TabsList className="font-mono">
          <TabsTrigger value="pending" className="font-mono text-xs tracking-wide">
            PENDING {pending.length > 0 && <span className="ml-1.5 bg-amber-500 text-black rounded-full px-1.5 text-[10px] font-bold">{pending.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="decided" className="font-mono text-xs tracking-wide">ALL REQUESTS</TabsTrigger>
        </TabsList>

        {/* PENDING TAB */}
        <TabsContent value="pending" className="mt-4">
          <div className="border border-border/50 rounded-lg overflow-hidden bg-card/30">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead className="font-mono text-xs">EMPLOYEE</TableHead>
                  <TableHead className="font-mono text-xs">TYPE</TableHead>
                  <TableHead className="font-mono text-xs">DATES</TableHead>
                  <TableHead className="font-mono text-xs text-right">DAYS</TableHead>
                  <TableHead className="font-mono text-xs">REASON</TableHead>
                  <TableHead className="font-mono text-xs text-right">ACTIONS</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-10 text-muted-foreground font-mono text-sm">
                      <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                    </TableCell>
                  </TableRow>
                ) : pending.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-10 text-muted-foreground font-mono text-sm">
                      <CheckCircle className="h-8 w-8 mx-auto mb-2 text-emerald-500/40" />
                      ALL CAUGHT UP — NO PENDING REQUESTS
                    </TableCell>
                  </TableRow>
                ) : (
                  pending.map((row: any) => (
                    <TableRow key={row.leave.id} className="hover:bg-muted/20">
                      <TableCell>
                        <div className="font-medium text-sm">{row.employee?.firstName} {row.employee?.lastName}</div>
                        <div className="text-xs text-muted-foreground font-mono">{row.employee?.empNo}</div>
                      </TableCell>
                      <TableCell className="capitalize text-sm">{row.leave.type}</TableCell>
                      <TableCell>
                        <div className="text-sm font-mono">{formatDate(row.leave.startDate)}</div>
                        <div className="text-xs text-muted-foreground font-mono">to {formatDate(row.leave.endDate)}</div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm font-medium">
                        {Math.round((row.leave.days ?? 0) / 10)}d
                      </TableCell>
                      <TableCell className="max-w-[200px]">
                        <span className="text-xs text-muted-foreground truncate block">
                          {row.leave.reason ?? "—"}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 w-8 p-0 text-destructive border-destructive/50 hover:bg-destructive hover:text-destructive-foreground"
                            onClick={() => handleDecide(row.leave.id, "reject")}
                            disabled={decide.isPending && decidingId === row.leave.id}
                            title="Reject"
                          >
                            {decide.isPending && decidingId === row.leave.id
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <X className="h-3.5 w-3.5" />}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 w-8 p-0 text-emerald-400 border-emerald-500/50 hover:bg-emerald-500 hover:text-white"
                            onClick={() => handleDecide(row.leave.id, "approve")}
                            disabled={decide.isPending && decidingId === row.leave.id}
                            title="Approve"
                          >
                            {decide.isPending && decidingId === row.leave.id
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <Check className="h-3.5 w-3.5" />}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ALL REQUESTS TAB */}
        <TabsContent value="decided" className="mt-4">
          <div className="border border-border/50 rounded-lg overflow-hidden bg-card/30">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead className="font-mono text-xs">EMPLOYEE</TableHead>
                  <TableHead className="font-mono text-xs">TYPE</TableHead>
                  <TableHead className="font-mono text-xs">DATES</TableHead>
                  <TableHead className="font-mono text-xs text-right">DAYS</TableHead>
                  <TableHead className="font-mono text-xs text-center">STATUS</TableHead>
                  {canCancel && <TableHead className="font-mono text-xs text-right">ACTIONS</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={canCancel ? 6 : 5} className="text-center py-10 text-muted-foreground font-mono text-sm">
                      <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                    </TableCell>
                  </TableRow>
                ) : (rows as any[]).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={canCancel ? 6 : 5} className="text-center py-10 text-muted-foreground font-mono text-sm">
                      NO REQUESTS FOUND
                    </TableCell>
                  </TableRow>
                ) : (
                  (rows as any[]).map((row: any) => (
                    <TableRow key={row.leave.id} className="hover:bg-muted/20">
                      <TableCell>
                        <div className="font-medium text-sm">{row.employee?.firstName} {row.employee?.lastName}</div>
                        <div className="text-xs text-muted-foreground font-mono">{row.employee?.empNo}</div>
                      </TableCell>
                      <TableCell className="capitalize text-sm">{row.leave.type}</TableCell>
                      <TableCell>
                        <div className="text-sm font-mono">{formatDate(row.leave.startDate)}</div>
                        <div className="text-xs text-muted-foreground font-mono">to {formatDate(row.leave.endDate)}</div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {Math.round((row.leave.days ?? 0) / 10)}d
                      </TableCell>
                      <TableCell className="text-center">
                        {leaveStatusBadge(row.leave.status)}
                      </TableCell>
                      {canCancel && (
                        <TableCell className="text-right">
                          {row.leave.status === "approved" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs font-mono text-destructive border-destructive/50 hover:bg-destructive hover:text-destructive-foreground gap-1"
                              onClick={() => setCancelTarget(row.leave.id)}
                            >
                              <XCircle className="h-3 w-3" />
                              CANCEL
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground font-mono">—</span>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      {/* Cancel confirmation dialog */}
      <AlertDialog open={cancelTarget !== null} onOpenChange={(open) => !open && setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-mono flex items-center gap-2">
              <XCircle className="h-4 w-4 text-destructive" />
              CANCEL APPROVED LEAVE
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will cancel the approved leave and restore the employee's leave balance.
              The action is logged in the audit trail.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-mono">KEEP LEAVE</AlertDialogCancel>
            <AlertDialogAction
              className="font-mono bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              onClick={() => cancelTarget !== null && cancelLeave.mutate(cancelTarget)}
              disabled={cancelLeave.isPending}
            >
              {cancelLeave.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              CANCEL LEAVE
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
