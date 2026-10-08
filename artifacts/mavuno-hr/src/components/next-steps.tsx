import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowRight, Check, Circle } from "lucide-react";

export type NextStep = {
  key: string; stage: "before" | "payroll" | "after"; label: string; detail: string;
  state: "done" | "todo" | "waiting"; href?: string; cta?: string;
};
export type NextSteps = {
  period: string; periodLabel: string; runId: number | null; runStatus: string | null;
  steps: NextStep[]; next: NextStep | null;
};

export function useNextSteps() {
  return useQuery<NextSteps>({
    queryKey: ["/api/dashboard/next-steps"],
    queryFn: () => customFetch("/api/dashboard/next-steps") as Promise<NextSteps>,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });
}

const STAGE_LABEL = { before: "BEFORE PAYROLL", payroll: "PAYROLL", after: "AFTER PAYROLL" } as const;

/** The month's payroll cycle as a checklist, with a button on the next thing to do. */
export function NextStepsChecklist() {
  const { data } = useNextSteps();
  if (!data) return null;
  const nextKey = data.next?.key;
  return (
    <section className="border-2 border-primary/40 bg-primary/5 px-4 py-4 space-y-3" aria-label="This month's next steps">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h2 className="font-semibold">{data.periodLabel} — next steps</h2>
        <span className="text-xs text-muted-foreground">
          {data.next ? "Work down the list; the highlighted step is next." : "Everything for this month is done."}
        </span>
      </div>
      <ol className="space-y-1.5">
        {data.steps.map((s, i) => {
          const isNext = s.key === nextKey;
          const showStage = i === 0 || data.steps[i - 1].stage !== s.stage;
          return (
            <li key={s.key}>
              {showStage && <p className="text-[10px] font-mono text-muted-foreground mt-2 mb-1">{STAGE_LABEL[s.stage]}</p>}
              <div className={`flex flex-wrap items-center gap-3 rounded-md px-3 py-2 ${isNext ? "bg-card border border-primary/50 shadow-sm" : ""}`}>
                <span className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                  s.state === "done" ? "bg-primary border-primary text-primary-foreground"
                  : isNext ? "border-primary text-primary" : "border-border text-muted-foreground"}`}>
                  {s.state === "done" ? <Check className="h-3 w-3" /> : isNext ? <ArrowRight className="h-3 w-3" /> : <Circle className="h-2 w-2" />}
                </span>
                <div className="flex-1 min-w-[200px]">
                  <p className={`text-sm ${s.state === "done" ? "text-muted-foreground line-through decoration-muted-foreground/40" : "font-medium"}`}>{s.label}</p>
                  <p className="text-xs text-muted-foreground">{s.detail}</p>
                </div>
                {s.state === "todo" && s.href && s.cta && (
                  <Link href={s.href}>
                    <Button size="sm" variant={isNext ? "default" : "outline"} className="font-mono gap-1.5">
                      {s.cta} <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  </Link>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
