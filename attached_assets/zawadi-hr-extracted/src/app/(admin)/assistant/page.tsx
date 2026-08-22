"use client";

import { useEffect, useRef, useState } from "react";
import { Card, PageHeader, Input, Button } from "@/components/ui";

interface Msg {
  role: "user" | "ai";
  text: string;
  table?: { columns: string[]; rows: (string | number)[][] } | null;
}

const STARTERS = [
  "Show employees earning above 200,000",
  "Who has not taken leave?",
  "Compare payroll this month to last month",
  "Explain Wanjiku's payslip",
  "Detect payroll anomalies",
  "What are the current PAYE tax bands?",
];

function renderText(t: string) {
  const parts = t.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith("**") && p.endsWith("**") ? <strong key={i} className="font-bold text-white">{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>
  );
}

export default function AssistantPage() {
  const [msgs, setMsgs] = useState<Msg[]>([
    {
      role: "ai",
      text: "Habari! I'm **Zawadi AI** — your payroll copilot. Ask me anything about your workforce, payroll, taxes or compliance in plain English. I query your live data and the Kenyan statutory rule engine in real time.",
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  const send = async (text?: string) => {
    const message = (text ?? input).trim();
    if (!message || busy) return;
    setInput("");
    setMsgs((m) => [...m, { role: "user", text: message }]);
    setBusy(true);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const body = await res.json();
      setMsgs((m) => [...m, { role: "ai", text: body.reply, table: body.table }]);
    } catch {
      setMsgs((m) => [...m, { role: "ai", text: "Something went wrong — please try again." }]);
    }
    setBusy(false);
  };

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col md:h-[calc(100vh-5rem)]">
      <PageHeader
        title="Zawadi AI"
        subtitle="Natural-language analytics, payslip explanations, anomaly detection and statutory guidance — powered by the live payroll ledger."
      />

      <Card className="flex min-h-0 flex-1 flex-col">
        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {msgs.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] ${m.role === "user" ? "" : "w-full md:max-w-[85%]"}`}>
                {m.role === "ai" && (
                  <div className="mb-1.5 flex items-center gap-2 text-[11px] font-bold text-fuchsia-300">
                    <span className="flex h-5 w-5 items-center justify-center rounded-md bg-gradient-to-br from-violet-500 to-fuchsia-500 text-[10px] text-white">✦</span>
                    ZAWADI AI
                  </div>
                )}
                <div
                  className={`rounded-2xl px-4 py-3 text-[13.5px] leading-relaxed ${
                    m.role === "user"
                      ? "bg-gradient-to-r from-emerald-400 to-teal-500 font-medium text-black"
                      : "border border-white/[0.07] bg-white/[0.03] text-slate-300"
                  }`}
                >
                  {m.role === "ai" ? m.text.split("\n").map((line, li) => <p key={li} className={li > 0 ? "mt-1.5" : ""}>{renderText(line)}</p>) : m.text}
                </div>
                {m.table && m.table.rows.length > 0 && (
                  <div className="mt-2 overflow-x-auto rounded-xl border border-white/[0.07] bg-white/[0.02]">
                    <table className="w-full">
                      <thead className="border-b border-white/[0.06]">
                        <tr>
                          {m.table.columns.map((c) => (
                            <th key={c} className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">{c}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.04]">
                        {m.table.rows.map((row, ri) => (
                          <tr key={ri}>
                            {row.map((cell, ci) => (
                              <td key={ci} className="px-3 py-2 text-[12px] text-slate-300">
                                {typeof cell === "number" ? <span className="tabular-nums">{cell.toLocaleString("en-KE")}</span> : cell}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          ))}
          {busy && (
            <div className="flex items-center gap-2 text-[12px] text-slate-500">
              <span className="h-2 w-2 animate-pulse rounded-full bg-fuchsia-400" /> Zawadi AI is analysing your payroll ledger…
            </div>
          )}
          <div ref={endRef} />
        </div>

        <div className="border-t border-white/[0.06] p-4">
          <div className="mb-3 flex flex-wrap gap-2">
            {STARTERS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[11px] text-slate-400 transition-colors hover:border-fuchsia-400/30 hover:text-fuchsia-300"
              >
                {s}
              </button>
            ))}
          </div>
          <form
            className="flex gap-3"
            onSubmit={(e) => { e.preventDefault(); send(); }}
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder='Ask anything… e.g. "Show employees earning above 200k"'
            />
            <Button type="submit" disabled={busy}>Send</Button>
          </form>
        </div>
      </Card>
    </div>
  );
}
