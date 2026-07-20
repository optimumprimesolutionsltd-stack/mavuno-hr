import { useState } from "react";
import { useGetFilings, useConfirmFiling } from "@workspace/api-client-react";
import { formatMoney } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  CheckCircle2,
  AlertCircle,
  Minus,
  FileCheck,
  Loader2,
  Info,
} from "lucide-react";
import { Link } from "wouter";

const KINDS = ["P10", "NSSF", "SHIF", "AHL"] as const;
type FilingKind = (typeof KINDS)[number];

const KIND_LABELS: Record<FilingKind, { label: string; description: string }> = {
  P10:  { label: "P10",  description: "KRA iTax PAYE return" },
  NSSF: { label: "NSSF", description: "NSSF eCitizen remittance" },
  SHIF: { label: "SHIF", description: "SHA portal remittance" },
  AHL:  { label: "AHL",  description: "Affordable Housing Levy" },
};

interface FilingRecord {
  id: number;
  status: string;
  filedAt: string | null;
  confirmedByEmail: string | null;
  itemCount: number;
  totalAmount: number;
  period: string;
  kind: string;
}

interface PeriodRow {
  period: string;
  runId: number;
  runName: string;
  runStatus: string;
  employeeCount: number;
  paidAt: string | null;
  filings: Record<string, FilingRecord | null>;
}

function formatPeriod(period: string) {
  const [y, m] = period.split("-");
  return new Date(Number(y), Number(m) - 1).toLocaleDateString("en-KE", { month: "short", year: "numeric" });
}

type CellStatus = "filed" | "pending" | "na";

function getCellStatus(row: PeriodRow, kind: FilingKind): CellStatus {
  const f = row.filings[kind];
  if (f) return "filed";
  if (["paid", "approved"].includes(row.runStatus)) return "pending";
  return "na";
}

function StatusCell({
  row,
  kind,
  onClickFiled,
}: {
  row: PeriodRow;
  kind: FilingKind;
  onClickFiled: (f: FilingRecord, period: string, kind: FilingKind) => void;
}) {
  const status = getCellStatus(row, kind);
  const filing = row.filings[kind];

  if (status === "na") {
    return (
      <td className="px-4 py-3 text-center">
        <span className="text-muted-foreground/30 text-sm font-mono">—</span>
      </td>
    );
  }

  if (status === "pending") {
    return (
      <td className="px-4 py-3 text-center">
        <Link href={`/admin/payroll/${row.runId}`}>
          <span className="inline-flex items-center gap-1.5 text-amber-500 text-xs font-medium cursor-pointer hover:text-amber-400 transition-colors">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            Pending
          </span>
        </Link>
      </td>
    );
  }

  // filed
  const filedDate = filing?.filedAt
    ? new Date(filing.filedAt).toLocaleDateString("en-KE", { day: "numeric", month: "short" })
    : "—";

  return (
    <td className="px-4 py-3 text-center">
      <button
        onClick={() => filing && onClickFiled(filing, row.period, kind)}
        className="inline-flex items-center gap-1.5 text-emerald-400 text-xs font-medium hover:text-emerald-300 transition-colors group"
      >
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
        <span>{filedDate}</span>
        <Info className="h-3 w-3 opacity-0 group-hover:opacity-60 transition-opacity" />
      </button>
    </td>
  );
}

interface DetailState {
  filing: FilingRecord;
  period: string;
  kind: FilingKind;
}

export function FilingsPage() {
  const { data, isLoading, refetch } = useGetFilings();
  const confirmMutation = useConfirmFiling();
  const [detail, setDetail] = useState<DetailState | null>(null);
  const [confirmingId, setConfirmingId] = useState<number | null>(null);

  const periods: PeriodRow[] = (data as any)?.periods ?? [];
  const outstanding: string[] = (data as any)?.outstanding ?? [];
  const currentPeriod: string = (data as any)?.currentPeriod ?? "";

  const handleConfirm = async (id: number) => {
    setConfirmingId(id);
    try {
      await confirmMutation.mutateAsync(id);
      await refetch();
      setDetail(null);
    } finally {
      setConfirmingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight font-mono">STATUTORY FILINGS</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Monthly P10, NSSF, and SHIF filing status — download exports from the payroll run page
          </p>
        </div>
      </div>

      {/* Outstanding obligations banner */}
      {outstanding.length > 0 && currentPeriod && (
        <div className="border border-amber-500/40 bg-amber-500/10 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-amber-400 text-sm">
              Outstanding filings for {formatPeriod(currentPeriod)}
            </p>
            <p className="text-xs text-amber-300/80 mt-0.5">
              The following returns have not been downloaded yet:{" "}
              {outstanding.map((k) => KIND_LABELS[k as FilingKind]?.label ?? k).join(", ")}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap shrink-0">
            {outstanding.map((k) => {
              const row = periods.find((r) => r.period === currentPeriod);
              if (!row) return null;
              return (
                <Link key={k} href={`/admin/payroll/${row.runId}`}>
                  <Button size="sm" variant="outline" className="border-amber-500/50 text-amber-400 hover:bg-amber-500/10 text-xs h-7">
                    Download {k}
                  </Button>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Main grid */}
      <Card className="border-border/50 bg-card/50 shadow-sm overflow-hidden">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileCheck className="h-4 w-4 text-primary" />
            Filing Grid
          </CardTitle>
          <CardDescription>
            ✓ Filed = export downloaded · ⚠ Pending = run paid, export not yet downloaded · — = no payroll run
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading filings…
            </div>
          ) : periods.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <FileCheck className="h-12 w-12 opacity-20 mb-3" />
              <p className="text-sm">No payroll runs found. Run and approve payroll to see filing status here.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50 bg-muted/30">
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground text-xs uppercase tracking-wide">
                      Period
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground text-xs uppercase tracking-wide">
                      Run
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground text-xs uppercase tracking-wide">
                      Status
                    </th>
                    {KINDS.map((k) => (
                      <th key={k} className="px-4 py-3 text-center font-medium text-muted-foreground text-xs uppercase tracking-wide">
                        {KIND_LABELS[k].label}
                        <div className="text-[10px] font-normal normal-case text-muted-foreground/60">
                          {KIND_LABELS[k].description}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {periods.map((row, i) => {
                    const isCurrentPeriod = row.period === currentPeriod;
                    return (
                      <tr
                        key={row.period}
                        className={`border-b border-border/30 last:border-0 transition-colors hover:bg-muted/20 ${
                          isCurrentPeriod ? "bg-primary/5" : i % 2 === 0 ? "" : "bg-muted/10"
                        }`}
                      >
                        <td className="px-4 py-3 font-mono text-sm font-medium">
                          {formatPeriod(row.period)}
                          {isCurrentPeriod && (
                            <span className="ml-2 text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded font-sans">
                              Current
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">
                          <Link href={`/admin/payroll/${row.runId}`} className="hover:text-foreground transition-colors">
                            {row.runName}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <RunStatusBadge status={row.runStatus} />
                        </td>
                        {KINDS.map((k) => (
                          <StatusCell
                            key={k}
                            row={row}
                            kind={k}
                            onClickFiled={(f, p, kind) => setDetail({ filing: f, period: p, kind })}
                          />
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail modal */}
      <Dialog open={!!detail} onOpenChange={(open) => !open && setDetail(null)}>
        {detail && (
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="font-mono">
                {detail.kind} — {formatPeriod(detail.period)}
              </DialogTitle>
              <DialogDescription>{KIND_LABELS[detail.kind]?.description}</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div className="text-muted-foreground">Status</div>
                <div>
                  <span className={`font-medium ${detail.filing.status === "filed" ? "text-blue-400" : "text-emerald-400"}`}>
                    {detail.filing.status === "filed" ? "Confirmed Filed" : "Downloaded"}
                  </span>
                </div>
                <div className="text-muted-foreground">Filed / Downloaded</div>
                <div className="font-mono text-xs">
                  {detail.filing.filedAt
                    ? new Date(detail.filing.filedAt).toLocaleString("en-KE", {
                        day: "numeric", month: "short", year: "numeric",
                        hour: "2-digit", minute: "2-digit",
                      })
                    : "—"}
                </div>
                {detail.filing.status === "filed" && detail.filing.confirmedByEmail && (
                  <>
                    <div className="text-muted-foreground">Confirmed by</div>
                    <div className="font-mono text-xs">{detail.filing.confirmedByEmail}</div>
                  </>
                )}
                <div className="text-muted-foreground">Employee count</div>
                <div className="font-mono">{detail.filing.itemCount}</div>
                <div className="text-muted-foreground">Total amount</div>
                <div className="font-mono">{formatMoney(detail.filing.totalAmount)}</div>
                <div className="text-muted-foreground">Period</div>
                <div className="font-mono">{detail.period}</div>
              </div>

              {detail.filing.status !== "filed" && (
                <div className="border border-border/50 rounded-lg p-3 bg-muted/20 text-xs text-muted-foreground">
                  <Info className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" />
                  Mark as <strong>Confirmed Filed</strong> once you have actually submitted this return to the tax/NSSF/SHIF authority.
                </div>
              )}
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" size="sm" onClick={() => setDetail(null)}>Close</Button>
              {detail.filing.status !== "filed" && (
                <Button
                  size="sm"
                  disabled={confirmingId === detail.filing.id}
                  onClick={() => handleConfirm(detail.filing.id)}
                >
                  {confirmingId === detail.filing.id ? (
                    <><Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />Confirming…</>
                  ) : (
                    <><CheckCircle2 className="h-3.5 w-3.5 mr-2" />Mark as Filed</>
                  )}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

function RunStatusBadge({ status }: { status: string }) {
  const cfgs: Record<string, string> = {
    draft:            "border-muted-foreground/40 text-muted-foreground",
    pending_approval: "border-amber-500/60 text-amber-500",
    approved:         "border-blue-500/60 text-blue-400",
    paid:             "border-emerald-500/60 text-emerald-400",
    reversed:         "border-red-500/60 text-red-400",
  };
  return (
    <Badge variant="outline" className={`font-mono text-[10px] ${cfgs[status] ?? "border-muted-foreground/40 text-muted-foreground"}`}>
      {status.replace(/_/g, " ").toUpperCase()}
    </Badge>
  );
}
