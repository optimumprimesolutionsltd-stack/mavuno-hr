import { useListAuditLogs } from "@workspace/api-client-react";
import { formatDateTime } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ShieldAlert, Link as LinkIcon, Database, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function AuditLog() {
  const { data: logs, isLoading } = useListAuditLogs({ limit: 100 });

  return (
    <div className="space-y-6 max-w-[1200px] mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight font-mono">AUDIT TRAIL</h1>
          <p className="text-muted-foreground text-sm">Tamper-evident, hash-chained activity log</p>
        </div>
        <Badge variant="outline" className="font-mono bg-primary/10 text-primary border-primary/30">
          <ShieldAlert className="h-3 w-3 mr-2" /> IMMUTABLE RECORD
        </Badge>
      </div>

      <Card className="border-border/50 bg-card/30">
        <CardHeader className="border-b border-border/30 bg-muted/20">
          <CardTitle className="text-sm font-mono flex items-center">
            <Database className="h-4 w-4 mr-2" /> CRYPTOGRAPHIC LEDGER
          </CardTitle>
          <CardDescription className="font-mono text-xs">
            Every action is hashed with the previous action's hash to ensure data integrity.
          </CardDescription>
        </CardHeader>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-background/50">
              <TableRow>
                <TableHead className="font-mono text-xs w-[180px]">TIMESTAMP</TableHead>
                <TableHead className="font-mono text-xs">ACTOR</TableHead>
                <TableHead className="font-mono text-xs">ACTION</TableHead>
                <TableHead className="font-mono text-xs">TARGET</TableHead>
                <TableHead className="font-mono text-xs">DETAILS</TableHead>
                <TableHead className="font-mono text-xs text-right">HASH CHAIN</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground font-mono">VERIFYING LEDGER...</TableCell></TableRow>
              ) : !logs || logs.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground font-mono">NO RECORDS FOUND</TableCell></TableRow>
              ) : (
                logs.map((log) => (
                  <TableRow key={log.id} className="hover:bg-muted/30">
                    <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                      {formatDateTime(log.createdAt)}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm font-medium">{log.actorEmail}</div>
                      <div className="text-[10px] text-muted-foreground font-mono opacity-50">{log.actorIp || 'internal'}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="font-mono text-[10px] uppercase bg-primary/10 text-primary hover:bg-primary/20">
                        {log.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      <span className="text-muted-foreground">{log.entity}</span>
                      {log.entityId && <span className="text-foreground ml-1">#{log.entityId}</span>}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[250px] truncate">
                      {log.detail || '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end group">
                        <LinkIcon className="h-3 w-3 text-muted-foreground mr-2 opacity-30 group-hover:opacity-100 transition-opacity" />
                        <div className="font-mono text-[10px] flex items-center bg-background px-2 py-1 rounded border border-border/50 group-hover:border-primary/50 transition-colors">
                          <span className="text-muted-foreground/50 w-8 truncate">{log.prevHash?.substring(0,6) || 'root'}</span>
                          <ArrowRight className="h-3 w-3 mx-1 text-muted-foreground/50" />
                          <span className="text-primary font-bold">{log.hash.substring(0,8)}</span>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
