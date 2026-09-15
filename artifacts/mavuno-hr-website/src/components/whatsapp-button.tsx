import { useLocation } from "wouter";

/**
 * Click-to-chat on WhatsApp, with the question half-written already.
 *
 * The WhatsApp Business Platform number — the same one the Optimum notifier
 * sends demo confirmations from — so a reply lands in the same place the rest
 * of the lead conversation does, rather than on one person's personal handset.
 *
 * Kept as a wa.me link rather than an embedded chat widget on purpose: a widget
 * is a third-party script on every page, and this needs no script at all.
 */
const WHATSAPP_NUMBER = "254727209720";

/**
 * What the visitor's message says before they type anything.
 *
 * A blank WhatsApp thread puts the work of starting the conversation on the
 * person who was only browsing, and "Hi" tells us nothing about what they
 * wanted. Naming the page they came from means the first reply can be useful
 * instead of "how can I help?".
 */
const OPENERS: Record<string, string> = {
  "/pricing": "Hi Mavuno HR — I'm looking at your pricing and have a question.",
  "/paye-calculator": "Hi Mavuno HR — I was using the PAYE calculator and have a question.",
  "/net-to-gross-calculator": "Hi Mavuno HR — I was using the net-to-gross calculator and have a question.",
  "/compliance": "Hi Mavuno HR — I have a question about statutory compliance.",
  "/features": "Hi Mavuno HR — I have a question about what the system does.",
  "/demo": "Hi Mavuno HR — I'd like to book a demo.",
  "/guides": "Hi Mavuno HR — I was reading one of your guides and have a question.",
};

const DEFAULT_OPENER = "Hi Mavuno HR — I'd like to know more about your payroll system.";

export function whatsAppLink(path: string): string {
  // Guides live at /guides/<slug>; anything under a known section inherits its
  // opener rather than falling back to the generic one.
  const match = Object.keys(OPENERS).find((p) => path === p || path.startsWith(`${p}/`));
  const text = match ? OPENERS[match] : DEFAULT_OPENER;
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
}

/** WhatsApp's own glyph. Inlined so the button costs no extra request. */
function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" className={className}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.247-.694.247-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884a9.82 9.82 0 0 1 6.988 2.896 9.83 9.83 0 0 1 2.893 6.994c-.003 5.45-4.437 9.885-9.885 9.885M20.52 3.449C18.24 1.245 15.24 0 12.045 0 5.463 0 .104 5.359.101 11.945c0 2.096.549 4.142 1.595 5.945L0 24l6.305-1.654a11.9 11.9 0 0 0 5.683 1.448h.005c6.582 0 11.941-5.359 11.944-11.945a11.9 11.9 0 0 0-3.417-8.4" />
    </svg>
  );
}

/**
 * Sits beside "Book a Demo" at the foot of the page. Deliberately not a
 * floating bubble that follows the reader down every page — this is the
 * quiet option for someone who reached the end and still has a question,
 * not something that interrupts them on the way there.
 */
export function WhatsAppButton({ className = "" }: { className?: string }) {
  const [location] = useLocation();

  return (
    <a
      href={whatsAppLink(location)}
      target="_blank"
      rel="noopener noreferrer"
      className={
        "inline-flex items-center justify-center gap-2 h-11 px-6 rounded-md font-medium text-sm " +
        "bg-[#25D366] text-white hover:bg-[#1da851] transition-colors " + className
      }
    >
      <WhatsAppIcon className="h-4 w-4" />
      Chat on WhatsApp
    </a>
  );
}
