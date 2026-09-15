import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { MessageCircle, X, Send, Loader2 } from "lucide-react";
import { WhatsAppIcon, whatsAppLink } from "./whatsapp-button";

/**
 * The assistant, and WhatsApp, offered together in the corner of every page.
 *
 * Two buttons rather than one, because they answer different preferences and
 * neither substitutes for the other: the panel answers immediately but only
 * while the tab is open, and WhatsApp survives the visitor closing the laptop
 * and keeps the thread on their phone.
 *
 * The assistant is the same one behind the WhatsApp number — the shared
 * lead-notifier service — so a question asked here and a question asked there
 * get the same answer. `product: "mavuno"` tells it which brand it is
 * speaking for, so it never has to infer that from the visitor's wording.
 */
const CHAT_ENDPOINT =
  import.meta.env.VITE_CHAT_ENDPOINT || "https://optimum-prime-lead-notifier.onrender.com/chat";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const GREETING: ChatMessage = {
  role: "assistant",
  content:
    "Hello 👋 I'm the Mavuno HR assistant. Ask me anything about payroll, statutory deductions or pricing — or I can help you start a free trial.",
};

export function ChatWidget() {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([GREETING]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Keep the newest message in view as the conversation grows.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, open, sending]);

  async function send() {
    const text = draft.trim();
    if (!text || sending) return;

    // The greeting is ours, not part of the conversation — sending it back
    // would have the assistant answering itself.
    const history = [...messages.slice(1), { role: "user" as const, content: text }];
    setMessages((m) => [...m, { role: "user", content: text }]);
    setDraft("");
    setSending(true);
    setFailed(false);

    try {
      const res = await fetch(CHAT_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history, product: "mavuno" }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { reply?: string };
      setMessages((m) => [
        ...m,
        { role: "assistant", content: data.reply || "Sorry — I didn't catch that. Could you say it another way?" },
      ]);
    } catch {
      // Never leave the question looking swallowed. The WhatsApp route is
      // still open and does not depend on this service being up.
      setFailed(true);
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content:
            "Sorry — I can't reach my brain right now. You can message us on WhatsApp instead and a person will pick it up.",
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      {open && (
        <div
          className="fixed bottom-24 right-4 sm:right-6 z-50 w-[calc(100vw-2rem)] sm:w-96 max-w-[24rem] rounded-2xl border border-border bg-white shadow-2xl flex flex-col overflow-hidden"
          style={{ height: "min(30rem, calc(100vh - 8rem))" }}
          role="dialog"
          aria-label="Chat with Mavuno HR"
        >
          <div className="flex items-center justify-between gap-3 px-4 py-3 bg-secondary text-white shrink-0">
            <div className="min-w-0">
              <p className="font-semibold text-sm truncate">Mavuno HR Assistant</p>
              <p className="text-xs text-white/70">Online · usually replies instantly</p>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close chat"
              className="p-1 rounded hover:bg-white/10 transition-colors shrink-0"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div
                  className={
                    "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap " +
                    (m.role === "user"
                      ? "bg-primary text-white rounded-br-sm"
                      : "bg-muted text-secondary rounded-bl-sm")
                  }
                >
                  {m.content}
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-2xl rounded-bl-sm px-3.5 py-2">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              </div>
            )}
          </div>

          {failed && (
            <a
              href={whatsAppLink(location)}
              target="_blank"
              rel="noopener noreferrer"
              className="mx-4 mb-2 inline-flex items-center justify-center gap-2 rounded-lg bg-[#25D366] px-4 py-2 text-sm font-medium text-white shrink-0"
            >
              <WhatsAppIcon className="h-4 w-4" />
              Continue on WhatsApp
            </a>
          )}

          <form
            onSubmit={(e) => { e.preventDefault(); void send(); }}
            className="flex items-center gap-2 border-t border-border p-3 shrink-0"
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Type a message…"
              aria-label="Your message"
              className="flex-1 min-w-0 h-10 px-3 rounded-lg border border-border bg-background text-sm outline-none focus:border-primary"
            />
            <button
              type="submit"
              disabled={!draft.trim() || sending}
              aria-label="Send message"
              className="h-10 w-10 shrink-0 rounded-lg bg-primary text-white grid place-items-center disabled:opacity-40"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}

      {/* WhatsApp sits to the left of the assistant, the way it does on the
          Optimum site, so the two are recognisably a pair rather than one
          button hiding the other. */}
      <a
        href={whatsAppLink(location)}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Chat on WhatsApp"
        className="fixed bottom-6 right-20 sm:right-24 z-40 h-12 w-12 sm:h-14 sm:w-14 rounded-full bg-[#25D366] text-white shadow-xl grid place-items-center hover:bg-[#1da851] transition-colors"
      >
        <WhatsAppIcon className="h-5 w-5 sm:h-6 sm:w-6" />
      </a>

      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close chat" : "Chat with Mavuno HR"}
        aria-expanded={open}
        className="fixed bottom-6 right-4 sm:right-6 z-40 h-12 w-12 sm:h-14 sm:w-14 rounded-full bg-primary text-white shadow-xl grid place-items-center hover:opacity-90 transition-opacity"
      >
        {open ? <X className="h-5 w-5 sm:h-6 sm:w-6" /> : <MessageCircle className="h-5 w-5 sm:h-6 sm:w-6" />}
      </button>
    </>
  );
}
