import { useState } from "react";
import { useListPortalLeave, useCreatePortalLeave, getListPortalLeaveQueryKey } from "@workspace/api-client-react";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Loader2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";

export function PortalLeave() {
  const { data: leaves, isLoading } = useListPortalLeave();
  const createLeave = useCreatePortalLeave();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const [type, setType] = useState<any>("annual");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");

  const handleSubmit = () => {
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
          toast({ variant: "destructive", title: "Error", description: err.message || "Failed to submit request." });
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
                    <SelectItem value="annual">ANNUAL LEAVE</SelectItem>
                    <SelectItem value="sick">SICK LEAVE</SelectItem>
                    <SelectItem value="maternity">MATERNITY LEAVE</SelectItem>
                    <SelectItem value="paternity">PATERNITY LEAVE</SelectItem>
                    <SelectItem value="compassionate">COMPASSIONATE LEAVE</SelectItem>
                    <SelectItem value="unpaid">UNPAID LEAVE</SelectItem>
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
              <Button onClick={handleSubmit} className="w-full font-mono mt-4" disabled={createLeave.isPending || !startDate || !endDate}>
                {createLeave.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                SUBMIT REQUEST
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="border border-border/50 rounded-lg overflow-hidden bg-card/30">
        <Table>
          <TableHeader className="bg-muted/30">
            <TableRow>
              <TableHead className="font-mono text-xs">DATE FILED</TableHead>
              <TableHead className="font-mono text-xs">TYPE</TableHead>
              <TableHead className="font-mono text-xs">PERIOD</TableHead>
              <TableHead className="font-mono text-xs text-right">DAYS</TableHead>
              <TableHead className="font-mono text-xs text-right">STATUS</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground font-mono">LOADING REQUESTS...</TableCell>
              </TableRow>
            ) : !leaves || leaves.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground font-mono">NO LEAVE REQUESTS FOUND</TableCell>
              </TableRow>
            ) : (
              leaves.map((row) => (
                <TableRow key={row.id} className="hover:bg-muted/20">
                  <TableCell className="font-mono text-xs text-muted-foreground">{formatDate(row.createdAt)}</TableCell>
                  <TableCell className="capitalize text-sm font-medium">{row.type}</TableCell>
                  <TableCell>
                    <div className="text-sm font-mono">{formatDate(row.startDate)}</div>
                    <div className="text-xs text-muted-foreground font-mono">to {formatDate(row.endDate)}</div>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">{row.days}</TableCell>
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
