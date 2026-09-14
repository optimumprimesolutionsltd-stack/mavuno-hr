import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Mail, Loader2, CheckCircle2 } from "lucide-react";

interface DemoRequest {
  id: number;
  email: string;
  company: string | null;
  message: string | null;
  sourcePath: string | null;
  status: "new" | "contacted";
  createdAt: string;
}

function useDemoRequests() {
  return useQuery<DemoRequest[]>({
    queryKey: ["super-demo-requests"],
    queryFn: () => customFetch("/api/super/demo-requests"),
  });
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleString("en-KE", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function SuperAdminDemoRequests() {
  const { data: requests = [], isLoading } = useDemoRequests();
  const { toast } = useToast();
  const qc = useQueryClient();

  const markContacted = useMutation({
    mutationFn: (id: number) =>
      customFetch(`/api/super/demo-requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "contacted" }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["super-demo-requests"] });
    },
    onError: (e: any) => {
      toast({ variant: "destructive", title: "Could not update", description: e?.message });
    },
  });

  const newCount = requests.filter((r) => r.status === "new").length;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Mail className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight font-mono">DEMO REQUESTS</h1>
            <p className="text-muted-foreground text-sm">
              Leads from the marketing site's "Request Demo" form
              {newCount > 0 && <span className="text-amber-400"> — {newCount} new</span>}
            </p>
          </div>
        </div>
      </div>

      <div className="border border-border/50 rounded-lg overflow-hidden bg-card/30">
        <Table>
          <TableHeader className="bg-muted/30">
            <TableRow>
              <TableHead className="font-mono text-xs">EMAIL</TableHead>
              <TableHead className="font-mono text-xs">COMPANY</TableHead>
              <TableHead className="font-mono text-xs">PAGE</TableHead>
              <TableHead className="font-mono text-xs">RECEIVED</TableHead>
              <TableHead className="font-mono text-xs text-right">STATUS</TableHead>
              <TableHead className="font-mono text-xs text-right"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground font-mono">
                  LOADING…
                </TableCell>
              </TableRow>
            ) : requests.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground font-mono">
                  NO DEMO REQUESTS YET
                </TableCell>
              </TableRow>
            ) : (
              requests.map((r) => (
                <TableRow key={r.id} className="hover:bg-muted/10">
                  <TableCell className="text-sm">
                    <a href={`mailto:${r.email}`} className="hover:text-primary transition-colors font-medium">{r.email}</a>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.company ?? "—"}</TableCell>
                  <TableCell className="text-xs font-mono text-muted-foreground">{r.sourcePath ?? "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground font-mono">{fmtDate(r.createdAt)}</TableCell>
                  <TableCell className="text-right">
                    <Badge
                      variant="outline"
                      className={`font-mono text-[10px] py-0.5 ${
                        r.status === "new"
                          ? "border-amber-500/60 text-amber-400 bg-amber-500/10"
                          : "border-emerald-500/60 text-emerald-400 bg-emerald-500/10"
                      }`}
                    >
                      {r.status.toUpperCase()}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {r.status === "new" && (
                      <Button
                        size="sm" variant="outline"
                        className="font-mono gap-1.5"
                        onClick={() => markContacted.mutate(r.id)}
                        disabled={markContacted.isPending}
                      >
                        {markContacted.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                        MARK CONTACTED
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
