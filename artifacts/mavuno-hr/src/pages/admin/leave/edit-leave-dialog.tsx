import { useEffect, useState } from "react";
import { customFetch } from "@workspace/api-client-react";
import { useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

/**
 * Fix the dates of a leave request that has not been decided yet, so a
 * mistyped end date doesn't have to wait for a rejection. `url` is the PATCH
 * endpoint: /api/portal/leave/:id for the employee, /api/leaves/:id/edit for HR.
 * The server recounts the days against the employee's work schedule.
 */
export function EditLeaveDialog({
  leave, url, onClose, onSaved,
}: {
  leave: { id: number; type: string; startDate: string; endDate: string; reason?: string | null } | null;
  url: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  useEffect(() => {
    if (leave) { setStartDate(leave.startDate.slice(0, 10)); setEndDate(leave.endDate.slice(0, 10)); }
  }, [leave]);

  const save = useMutation({
    mutationFn: () => customFetch(url!, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: leave!.type, startDate, endDate, reason: leave!.reason ?? undefined }),
    }),
    onSuccess: () => { toast({ title: "Leave request updated" }); onSaved(); onClose(); },
    onError: (e: any) => toast({ variant: "destructive", title: "Could not update", description: e?.data?.error ?? e?.message }),
  });

  return (
    <Dialog open={!!leave} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit leave dates</DialogTitle>
          <DialogDescription>Only requests that are still pending can be changed.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2"><Label>Start date</Label><Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></div>
          <div className="space-y-2"><Label>End date</Label><Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></div>
        </div>
        <Button
          disabled={save.isPending || !startDate || !endDate || endDate < startDate}
          onClick={() => save.mutate()}
        >
          {save.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Save changes
        </Button>
      </DialogContent>
    </Dialog>
  );
}
