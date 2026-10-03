import { useState } from "react";
import { useGetPortalProfile } from "@workspace/api-client-react";
import { formatMoney, formatDate, fullName } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { User, Briefcase, FileText, Eye, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { PayslipDialog } from "./payslip-dialog";

/** Everything taken off a payslip, as the history table has always added it up. */
function totalDeductions(slip: any): number {
  return (slip.paye || 0) + (slip.nssfEmployee || 0) + (slip.shif || 0) +
    (slip.housingLevyEmployee || 0) + (slip.helb || 0) + (slip.sacco || 0) +
    (slip.loanDeduction || 0) + (slip.insurancePremium || slip.breakdown?.insurancePremium || 0) +
    (slip.pension || 0) + (slip.adjustmentDeductions || 0);
}

export function PortalProfile() {
  const { data: profile, isLoading } = useGetPortalProfile();
  const [selectedSlip, setSelectedSlip] = useState<any | null>(null);
  const { toast } = useToast();

  const handleDownload = (slipId: number, period: string) => {
    const token = sessionStorage.getItem("mavuno_session_token");
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
    fetch(`/api/portal/payslip/${slipId}/pdf`, { headers })
      .then((r) => {
        if (!r.ok) throw new Error("Download failed");
        return r.blob();
      })
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `Payslip_${period}.pdf`;
        document.body.appendChild(a);
        a.click();
        URL.revokeObjectURL(url);
        document.body.removeChild(a);
      })
      .catch(() => toast({ variant: "destructive", title: "Download failed", description: "Could not download payslip PDF." }));
  };

  if (isLoading || !profile) {
    return <div className="animate-pulse space-y-4 max-w-4xl mx-auto"><div className="h-8 w-64 bg-muted rounded" /><Card className="h-64" /></div>;
  }

  const { employee, payslips, leaveBalance } = profile;
  // The newest payslip, whatever order the list arrives in.
  const latest = (payslips ?? []).reduce<any | null>(
    (best, slip: any) => (!best || String(slip.period ?? "") > String(best.period ?? "") ? slip : best),
    null,
  );

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold uppercase leading-none">MY PROFILE</h1>
        <p className="text-muted-foreground text-sm">View your employment details and payslip history</p>
      </div>

      {/* What an employee opens this for: the latest payslip, first. */}
      {latest ? (
        <section aria-label="Latest payslip" className="border-2 border-foreground bg-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
            <p className="font-mono text-xs uppercase tracking-[0.08em] text-primary border-l-2 border-primary pl-2.5">
              Latest payslip · {latest.period || "Unknown"}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setSelectedSlip(latest)}>
                <Eye className="h-4 w-4 mr-1.5" /> View
              </Button>
              {latest.id ? (
                <Button size="sm" onClick={() => handleDownload(latest.id, latest.period || "")}>
                  <Download className="h-4 w-4 mr-1.5" /> Download PDF
                </Button>
              ) : null}
            </div>
          </div>
          <div className="grid grid-cols-3">
            {[
              { label: "Gross pay", value: formatMoney(latest.grossPay || latest.gross || 0), tone: "" },
              { label: "Deductions", value: formatMoney(totalDeductions(latest)), tone: "text-destructive" },
              { label: "Net pay", value: formatMoney(latest.netPay || 0), tone: "text-primary" },
            ].map((cell, i) => (
              <div key={cell.label} className={`min-w-0 p-4 ${i > 0 ? "border-l border-border" : ""}`}>
                <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">{cell.label}</p>
                <p className={`mt-1 truncate font-mono text-base sm:text-xl font-medium tabular-nums ${cell.tone}`}>{cell.value}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="border-border shadow-sm bg-card">
          <CardHeader className="pb-3 border-b border-border/30">
            <CardTitle className="text-sm font-mono flex items-center text-muted-foreground">
              <User className="h-4 w-4 mr-2 text-primary" />
              PERSONAL INFO
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 space-y-4">
            <div className="grid grid-cols-2 gap-y-4 text-sm">
              <div className="col-span-2">
                <span className="text-muted-foreground block text-xs">Full Name</span>
                <span className="font-medium text-lg">{fullName(employee)}</span>
              </div>
              <div><span className="text-muted-foreground block text-xs">Email</span>{employee.email}</div>
              <div><span className="text-muted-foreground block text-xs">Phone</span>{employee.phone || "-"}</div>
              <div><span className="text-muted-foreground block text-xs">National ID</span><span className="font-mono">{employee.nationalId || "-"}</span></div>
              <div><span className="text-muted-foreground block text-xs">KRA PIN</span><span className="font-mono">{employee.kraPin || "-"}</span></div>
              <div><span className="text-muted-foreground block text-xs">NSSF No</span><span className="font-mono">{employee.nssfNo || "-"}</span></div>
              <div><span className="text-muted-foreground block text-xs">SHIF No</span><span className="font-mono">{employee.shifNo || "-"}</span></div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border shadow-sm bg-card">
          <CardHeader className="pb-3 border-b border-border/30">
            <CardTitle className="text-sm font-mono flex items-center text-muted-foreground">
              <Briefcase className="h-4 w-4 mr-2 text-primary" />
              EMPLOYMENT
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 space-y-4">
            <div className="grid grid-cols-2 gap-y-4 text-sm">
              <div><span className="text-muted-foreground block text-xs">Employee No</span><span className="font-mono">{employee.empNo}</span></div>
              <div><span className="text-muted-foreground block text-xs">Position</span>{employee.position}</div>
              <div><span className="text-muted-foreground block text-xs">Type</span><span className="capitalize">{employee.employmentType?.replace("_", " ") ?? "-"}</span></div>
              <div><span className="text-muted-foreground block text-xs">Hire Date</span>{formatDate(employee.hireDate)}</div>
              <div className="col-span-2">
                <div className="flex justify-between items-center p-3 bg-primary/5 border border-primary/30 border-l-4 border-l-primary">
                  <span className="text-xs font-mono text-primary">LEAVE BALANCE</span>
                  <span className="font-mono font-bold text-lg text-primary">{leaveBalance} DAYS</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border shadow-sm bg-card">
        <CardHeader className="border-b border-border/30 flex flex-row items-center justify-between">
          <CardTitle className="font-mono text-sm flex items-center">
            <FileText className="h-4 w-4 mr-2" />
            PAYSLIP HISTORY
          </CardTitle>
          <p className="text-xs text-muted-foreground">Click a row to view details · <Download className="h-3 w-3 inline" /> to download PDF</p>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted">
              <TableRow>
                <TableHead className="font-mono text-xs">PERIOD</TableHead>
                <TableHead className="font-mono text-xs text-right">GROSS PAY</TableHead>
                <TableHead className="font-mono text-xs text-right">DEDUCTIONS</TableHead>
                <TableHead className="font-mono text-xs text-right text-primary">NET PAY</TableHead>
                <TableHead className="w-[90px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {payslips && payslips.length > 0 ? (
                payslips.map((slip: any, i: number) => {
                  return (
                    <TableRow
                      key={i}
                      className="hover:bg-muted/20 cursor-pointer"
                      onClick={() => setSelectedSlip(slip)}
                    >
                      <TableCell className="font-mono text-sm">{slip.period || "Unknown"}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{formatMoney(slip.grossPay || slip.gross || 0)}</TableCell>
                      <TableCell className="text-right font-mono text-sm text-destructive">{formatMoney(totalDeductions(slip))}</TableCell>
                      <TableCell className="text-right font-mono text-sm text-primary font-bold">{formatMoney(slip.netPay || 0)}</TableCell>
                      <TableCell>
                        <div className="flex gap-0.5">
                          <Button
                            variant="ghost" size="sm" className="h-8 w-8 p-0"
                            onClick={(e) => { e.stopPropagation(); setSelectedSlip(slip); }}
                            title="View details"
                          >
                            <Eye className="h-4 w-4 text-muted-foreground hover:text-primary" />
                          </Button>
                          {slip.id && (
                            <Button
                              variant="ghost" size="sm" className="h-8 w-8 p-0"
                              onClick={(e) => { e.stopPropagation(); handleDownload(slip.id, slip.period || ""); }}
                              title="Download PDF"
                            >
                              <Download className="h-4 w-4 text-muted-foreground hover:text-primary" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground font-mono text-sm">
                    NO PAYSLIPS AVAILABLE
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <PayslipDialog
        slip={selectedSlip}
        open={!!selectedSlip}
        onOpenChange={(v) => { if (!v) setSelectedSlip(null); }}
        employeeName={fullName(employee)}
      />
    </div>
  );
}
