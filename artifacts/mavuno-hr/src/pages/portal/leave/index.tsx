import { useState } from "react";
import { useListPortalLeave, useCreatePortalLeave, useGetPortalProfile, getListPortalLeaveQueryKey } from "@workspace/api-client-react";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Loader2, CalendarDays, CalendarCheck, CalendarX } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";

const ALL_LEAVE_TYPES = [
  { value: "annual",        label: "ANNUAL LEAVE" },
  { value: "sick",          label: "SICK LEAVE" },
  { value: "maternity",     label: "MATERNITY LEAVE",  gender: "female" },
  { value: "paternity",     label: "PATERNITY LEAVE",  gender: "male" },
  { value: "compassionate", label: "COMPASSIONATE LEAVE" },
  { value: "unpaid",        label: "UNPAID LEAVE" },
];

export function PortalLeave() {
  const { data: leaves, isLoading } = useListPortalLeave();
  const { data: profile } = useGetPortalProfile();
  const createLeave = useCreatePortalLeave();
  const gender = (profile as any)?.employee?.gender ?? null;

  const leaveTypes = ALL_LEAVE_TYPES.filter(
    (t) => !t.gender || t.gender === gender
  );

  const summary = (profile as any)?.leaveBalanceSummary as
    | { entitled: number; taken: number; remaining: number }
    | undefined;

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const [type, setType] = useState<any>("annual");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");

  const handleSubmit = () => {
    if (endDate && startDate && endDate < startDate) {
      toast({ variant: "destructive", title: "Invalid dates", description: "End date must be on or after the start date." });
      return;
    }
    createLeave.mutate(
      { data: { type, startDate, endDate, reason } },
      {
        onSuccess: () => {
          toast({ title: "Request Submitted", description: "Your leave request has been submitted for approval." });
          queryClient.invalidateQueries({ queryKey: getListPortalLeaveQueryKey() });
          setOpen(false);
          setStartDate("");
          setEndDate("");
          setReason("");
        },
        onError: (err: any) => {
          const msg = err?.data?.error ?? err?.message ?? "Failed to submit request.";
          toast({ variant: "destructive", title: "Error", description: msg });
        }
      }
    );
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight font-mono">MY LEAVE</h1>
          <p className="text-muted-foreground text-sm">Manage your leave requests and balances</p>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="font-mono">
              <Plus className="h-4 w-4 mr-2" />
              NEW REQUEST
            </Button>
          </DialogTrigger>
          <DialogContent className="border-border/50 bg-card/95 backdrop-blur-sm">
            <DialogHeader>
              <DialogTitle className="font-mono">SUBMIT LEAVE REQUEST</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Leave Type</Label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger className="font-mono">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {leaveTypes.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Start Date</Label>
                  <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>End Date</Label>
                  <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Reason (Optional)</Label>
                <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Provide details..." />
              </div>
              {type === "annual" && summary && (
                <p className="text-xs text-muted-foreground bg-muted/30 rounded p-2 font-mono">
                  You have <span className="font-bold text-primary">{summary.remaining}</span> annual day(s) remaining
                  ({summary.taken} of {summary.entitled} used)
                </p>
              )}
              <Button onClick={handleSubmit} className="w-full font-mono mt-4" disabled={createLeave.isPending || !startDate || !endDate}>
                {createLeave.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                SUBMIT REQUEST
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Leave balance summary cards */}
      {summary && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "ENTITLED", value: summary.entitled, icon: CalendarDays, color: "text-primary" },
            { label: "TAKEN", value: summary.taken, icon: CalendarX, color: "text-amber-400" },
            { label: "REMAINING", value: summary.remaining, icon: CalendarCheck, color: summary.remaining <= 3 ? "text-destructive" : "text-emerald-400" },
          ].map(({ label, value, icon: Icon, color }) => (
            <Card key={label} className="border-border/50 bg-card/30">
              <CardContent className="p-4 text-center">
                <Icon className={`h-5 w-5 mx-auto mb-2 ${color}`} />
                <div className={`text-3xl font-mono font-bold ${color}`}>{value}</div>
                <div className="text-xs text-muted-foreground font-mono mt-1">{label}</div>
                <div className="text-xs text-muted-foreground">days</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Leave history table */}
      <div className="border border-border/50 rounded-lg overflow-hidden bg-card/30">
        <Table>
          <TableHeader className="bg-muted/30">
            <TableRow>
              <TableHead className="font-mono text-xs">DATE FILED</TableHead>
              <TableHead className="font-mono text-xs">TYPE</TableHead>
              <TableHead className="font-mono text-xs">PERIOD</TableHead>
              <TableHead className="font-mono text-xs text-right">DAYS</TableHead>
              <TableHead className="font-mono text-xs text-right">BAL. AFTER</TableHead>
              <TableHead className="font-mono text-xs text-right">STATUS</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground font-mono">LOADING REQUESTS...</TableCell>
              </TableRow>
            ) : !leaves || leaves.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground font-mono">NO LEAVE REQUESTS FOUND</TableCell>
              </TableRow>
            ) : (
              (leaves as any[]).map((row) => (
                <TableRow key={row.id} className="hover:bg-muted/20">
                  <TableCell className="font-mono text-xs text-muted-foreground">{formatDate(row.createdAt)}</TableCell>
                  <TableCell className="capitalize text-sm font-medium">{row.type}</TableCell>
                  <TableCell>
                    <div className="text-sm font-mono">{formatDate(row.startDate)}</div>
                    <div className="text-xs text-muted-foreground font-mono">to {formatDate(row.endDate)}</div>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">{Math.round((row.days ?? 0) / 10)}</TableCell>
                  <TableCell className="text-right">
                    {row.balanceAfter != null ? (
                      <span className={`font-mono text-sm font-medium ${row.balanceAfter <= 3 ? "text-destructive" : row.balanceAfter <= 7 ? "text-amber-400" : "text-primary"}`}>
                        {row.balanceAfter}d
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant={row.status === 'pending' ? 'outline' : row.status === 'approved' ? 'default' : 'destructive'} className="font-mono text-[10px]">
                      {row.status.toUpperCase()}
                    </Badge>
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
