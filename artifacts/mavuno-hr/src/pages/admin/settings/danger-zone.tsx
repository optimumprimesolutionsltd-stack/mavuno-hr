import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Download } from "lucide-react";

/**
 * Scheduling and cancelling deletion of the whole organisation.
 *
 * Deliberately undramatic in the UI right up until the point of no return. The
 * dangerous thing here is not the click — it is that payroll data cannot be
 * recreated, and the employer still owes KRA the ability to produce records
 * years later. So the copy leads with "export first", and the confirmation is a
 * typed company name rather than a second button.
 */

interface DeletionStatus {
  scheduled: boolean;
  requestedAt: string | null;
  scheduledFor: string | null;
  graceDays: number;
}

function daysUntil(iso: string): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));
}

/**
 * Downloads everything the organisation holds as a ZIP of CSVs.
 *
 * Sits next to deletion because that is when it matters — the privacy page
 * tells people to export before they delete — but styled as an ordinary action,
 * because taking a copy of your own data is not dangerous and should not be
 * dressed up as though it were.
 *
 * Fetched rather than linked: the API takes a bearer token, which an <a href>
 * cannot carry. Same approach the bulk payslip PDF download uses.
 */
export function ExportData() {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    try {
      const token = sessionStorage.getItem("mavuno_session_token");
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch("/api/settings/export", { headers });
      if (!res.ok) throw new Error("The export could not be generated.");

      // Honour the filename the server chose — it carries the company slug and
      // the date, which is what makes a downloads folder full of these usable.
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const named = /filename="([^"]+)"/.exec(disposition)?.[1];

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = named ?? "mavuno-hr-export.zip";
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({ title: "Export downloaded", description: "Keep it somewhere safe and durable." });
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Export failed",
        description: err?.message ?? "Something went wrong generating the export.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="border-border/50 shadow-sm bg-card/30">
      <CardHeader className="pb-4">
        <CardTitle className="font-mono flex items-center gap-2 text-base">
          <Download className="h-4 w-4" />
          EXPORT YOUR DATA
        </CardTitle>
        <CardDescription>
          Everything this organisation holds, as a ZIP of spreadsheets.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground leading-relaxed">
          Employees, payroll runs, payslips, filings, leave, loans, billing and
          the audit trail — one CSV each, openable in Excel, with a README
          explaining what is in them. Login credentials are deliberately left
          out.
        </p>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Worth doing before you delete the account, and worth doing once a year
          regardless: you remain the employer, and the KRA can ask you to produce
          P9s and returns for past years.
        </p>
        <Button variant="outline" onClick={download} disabled={busy}>
          {busy ? "Preparing…" : "Download everything"}
        </Button>
      </CardContent>
    </Card>
  );
}

export function DangerZone({ orgName }: { orgName: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [confirmName, setConfirmName] = useState("");

  const { data, isLoading } = useQuery<DeletionStatus>({
    queryKey: ["org-deletion"],
    queryFn: () => customFetch("/api/settings/deletion") as Promise<DeletionStatus>,
  });

  const schedule = useMutation({
    mutationFn: () =>
      customFetch("/api/settings/deletion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmName }),
      }),
    onSuccess: () => {
      setConfirmName("");
      toast({
        title: "Deletion scheduled",
        description: "You can cancel this at any point before the date shown.",
      });
      qc.invalidateQueries({ queryKey: ["org-deletion"] });
    },
    onError: (e: any) =>
      toast({
        variant: "destructive",
        title: "Could not schedule deletion",
        description: e?.data?.error ?? e?.message,
      }),
  });

  const cancel = useMutation({
    mutationFn: () => customFetch("/api/settings/deletion", { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Deletion cancelled", description: "Your account and data are staying put." });
      qc.invalidateQueries({ queryKey: ["org-deletion"] });
    },
    onError: (e: any) =>
      toast({
        variant: "destructive",
        title: "Could not cancel",
        description: e?.data?.error ?? e?.message,
      }),
  });

  if (isLoading || !data) return null;

  return (
    <Card className="border-destructive/40 shadow-sm bg-destructive/[0.03]">
      <CardHeader className="pb-4">
        <CardTitle className="font-mono flex items-center gap-2 text-base text-destructive">
          <AlertTriangle className="h-4 w-4" />
          DELETE THIS ACCOUNT
        </CardTitle>
        <CardDescription>
          Removes this organisation and everything in it — employees, payroll
          runs, payslips, filings, loans, leave, users and the audit trail.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        {data.scheduled && data.scheduledFor ? (
          <>
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
              <p className="font-semibold text-destructive mb-1">
                Scheduled for {new Date(data.scheduledFor).toLocaleDateString("en-KE", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </p>
              <p className="text-sm text-muted-foreground">
                {daysUntil(data.scheduledFor)} days left. Everything still works
                normally until then, and cancelling puts it back exactly as it
                was — nothing is removed before the date above.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => cancel.mutate()}
              disabled={cancel.isPending}
            >
              {cancel.isPending ? "Cancelling…" : "Cancel scheduled deletion"}
            </Button>
          </>
        ) : (
          <>
            <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
              <p>
                Deletion is scheduled, not immediate: nothing is removed for{" "}
                <strong className="text-foreground">{data.graceDays} days</strong>, and
                you can cancel at any point in that window.
              </p>
              <p className="rounded-lg border-l-2 border-destructive/50 bg-background/60 px-4 py-3">
                <strong className="text-foreground">Export what you need first.</strong>{" "}
                Payroll records cannot be recreated, and you remain the employer:
                KRA can still ask you to produce P9s and returns for past years
                after this account is gone. Use the grace period to take copies
                of anything you are required to keep.
              </p>
              <p>This cannot be undone once the date passes.</p>
            </div>

            <div className="space-y-2 max-w-sm">
              <Label htmlFor="confirm-name" className="text-sm">
                Type <span className="font-mono font-semibold text-foreground">{orgName}</span> to confirm
              </Label>
              <Input
                id="confirm-name"
                value={confirmName}
                onChange={(e) => setConfirmName(e.target.value)}
                placeholder={orgName}
                autoComplete="off"
              />
            </div>

            <Button
              variant="destructive"
              onClick={() => schedule.mutate()}
              disabled={
                schedule.isPending ||
                confirmName.trim().toLowerCase() !== orgName.trim().toLowerCase()
              }
            >
              {schedule.isPending ? "Scheduling…" : `Schedule deletion in ${data.graceDays} days`}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
