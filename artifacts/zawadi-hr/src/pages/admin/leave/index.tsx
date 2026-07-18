import { useState } from "react";
import { useListLeaves, useDecideLeave, getListLeavesQueryKey } from "@workspace/api-client-react";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Check, X, Calendar, Search } from "lucide-react";
import { Input } from "@/components/ui/input";

export function LeaveAdmin() {
  const { data: leaves, isLoading } = useListLeaves();
  const decideLeave = useDecideLeave();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");

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

  const filtered = leaves?.filter(r => 
    r.employee.firstName.toLowerCase().includes(search.toLowerCase()) ||
    r.employee.lastName.toLowerCase().includes(search.toLowerCase())
  ) || [];

  return (
    <div className="space-y-6 max-w-[1200px] mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight font-mono">LEAVE MANAGEMENT</h1>
          <p className="text-muted-foreground text-sm">Review and approve employee leave requests</p>
        </div>
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
              <TableHead className="font-mono text-xs text-center">STATUS</TableHead>
              <TableHead className="font-mono text-xs text-right">ACTIONS</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground font-mono">
                  LOADING LEAVE REQUESTS...
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground font-mono">
                  NO LEAVE REQUESTS FOUND
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((row) => (
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
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
