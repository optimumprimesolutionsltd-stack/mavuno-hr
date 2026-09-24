import { Input } from "@/components/ui/input";
import { LOAN_TYPE_OPTIONS, type LoanConfig } from "@/lib/loan-config";

/** One row per loan type: is it offered, and the longest repayment period. */
export function LoanConfigEditor({ value, onChange }: { value: LoanConfig; onChange: (v: LoanConfig) => void }) {
  return (
    <div className="space-y-2">
      {LOAN_TYPE_OPTIONS.map((t) => {
        const c = value[t.value] ?? { enabled: true, maxMonths: 60 };
        return (
          <div key={t.value} className="flex items-center gap-3 rounded-md border border-border/50 bg-background/30 px-3 py-2">
            <label className="flex items-center gap-2 flex-1 cursor-pointer text-sm">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={c.enabled}
                onChange={(e) => onChange({ ...value, [t.value]: { ...c, enabled: e.target.checked } })}
              />
              {t.label}
            </label>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Max</span>
              <Input
                type="number" min={1} max={60}
                className="h-8 w-16"
                disabled={!c.enabled}
                value={c.maxMonths}
                onChange={(e) => onChange({ ...value, [t.value]: { ...c, maxMonths: Math.min(60, Math.max(1, Number(e.target.value) || 1)) } })}
              />
              <span>months</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
