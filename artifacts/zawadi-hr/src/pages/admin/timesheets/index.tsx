import { useState } from "react";
import { useListTimesheets, useApproveTimesheet } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Clock, Calendar } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function TimesheetAdmin() {
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const { data: timesheets, isLoading } = useListTimesheets({ period });
  const approveTimesheet = useApproveTimesheet();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleApprove = (id: number) => {
    approveTimesheet.mutate(
      { data: { id } },
      {
        onSuccess: () => {
          toast({ title: "Timesheet Approved" });
          queryClient.invalidateQueries({ queryKey: ["/api/timesheets"] });
        },
        onError: () => {
          toast({ variant: "destructive", title: "Error", description: "Failed to approve timesheet." });
        }
      }
    );
  };

  return (
    <div className="space-y-6 max-w-[1200px] mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight font-mono">TIMESHEETS</h1>
          <p className="text-muted-foreground text-sm">Review employee hours for casuals and overtime</p>
        </div>
        
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <input 
            type="month" 
            value={period} 
            onChange={(e) => setPeriod(e.target.value)} 
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>
      </div>

      <div className="border border-border/50 rounded-lg overflow-hidden bg-card/30">
        <Table>
          <TableHeader className="bg-muted/30">
            <TableRow>
              <TableHead className="font-mono text-xs">EMPLOYEE</TableHead>
              <TableHead className="font-mono text-xs text-right">DAYS</TableHead>
              <TableHead className="font-mono text-xs text-right">NORMAL HRS</TableHead>
              <TableHead className="font-mono text-xs text-right">OVERTIME</TableHead>
              <TableHead className="font-mono text-xs text-right">HOLIDAY</TableHead>
              <TableHead className="font-mono text-xs text-center">STATUS</TableHead>
              <TableHead className="font-mono text-xs text-right">ACTIONS</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground font-mono">
                  LOADING TIMESHEETS...
                </TableCell>
              </TableRow>
            ) : !timesheets || timesheets.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground font-mono">
                  NO TIMESHEETS FOR {period}
                </TableCell>
              </TableRow>
            ) : (
              timesheets.map((row) => (
                <TableRow key={row.timesheet.id} className="group transition-colors hover:bg-muted/20">
                  <TableCell>
                    <div className="font-medium text-sm">{row.employee.firstName} {row.employee.lastName}</div>
                    <div className="text-xs text-muted-foreground font-mono">{row.employee.empNo} • {row.employee.employmentType.replace('_', ' ')}</div>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">{row.timesheet.daysWorked}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{row.timesheet.normalHours}</TableCell>
                  <TableCell className="text-right font-mono text-sm text-chart-3">{row.timesheet.overtimeHours}</TableCell>
                  <TableCell className="text-right font-mono text-sm text-chart-4">{row.timesheet.holidayHours}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant={row.timesheet.approvedAt ? 'default' : 'outline'} className="font-mono text-[10px]">
                      {row.timesheet.approvedAt ? 'APPROVED' : 'PENDING'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {!row.timesheet.approvedAt && (
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="h-8 text-xs font-mono text-primary border-primary hover:bg-primary hover:text-primary-foreground"
                        onClick={() => handleApprove(row.timesheet.id)}
                        disabled={approveTimesheet.isPending}
                      >
                        <Check className="h-4 w-4 mr-1" /> APPROVE
                      </Button>
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
