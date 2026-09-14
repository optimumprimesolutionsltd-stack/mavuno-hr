import { logger } from "./logger.js";
import { describeSlot } from "./demo-slot.js";

/**
 * Push a marketing-site demo request into the Optimum Prime CRM (the
 * Firebase-backed admin at optimum-prime-solutions-website), the same place
 * the Tally site's own "Request a Demo" form writes to, and trigger the same
 * WhatsApp notifications that form gets: an alert to the team, and a
 * confirmation back to the lead.
 *
 * Two calls, both best-effort — a Mavuno demo request that already has its
 * own row in demo_requests (see routes/public.ts) should never be lost or
 * delayed by either of these failing.
 *
 * 1. Firebase Realtime Database write. The CRM's public site writes leads/
 *    the same way: sign in anonymously (Firebase Anonymous Auth is already
 *    enabled for that project — see src/context/SiteContext.tsx there),
 *    which is enough to satisfy leads/$id's `.write` rule for a brand-new
 *    record (`auth != null && !data.exists()`), then PUT the lead with that
 *    session's ID token. No service-account credential needed or held here —
 *    same trust level an anonymous website visitor already has, nothing more.
 *    The apiKey and databaseURL below are Firebase's public web config (the
 *    same values shipped in that site's own client bundle), not secrets.
 * 2. POST to the lead-notifier service already used for every other lead on
 *    that site (optimum-prime-lead-notifier), which sends the WhatsApp
 *    template alert to the team and, since a phone number is supplied, the
 *    WhatsApp confirmation back to the lead.
 */

const FIREBASE_API_KEY = "AIzaSyAY8O5LRWxcJgkYhNn1SstAylc-q959vv0";
const FIREBASE_DB_URL = "https://optimum-prime-website-default-rtdb.europe-west1.firebasedatabase.app";
const LEAD_NOTIFIER_URL = process.env.OPTIMUM_LEAD_NOTIFIER_URL?.trim()
  || "https://optimum-prime-lead-notifier.onrender.com";

async function anonymousFirebaseIdToken(): Promise<string> {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_API_KEY}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ returnSecureToken: true }) },
  );
  if (!res.ok) throw new Error(`Firebase anonymous sign-in failed: ${res.status}`);
  const data = (await res.json()) as { idToken?: string };
  if (!data.idToken) throw new Error("Firebase anonymous sign-in returned no idToken");
  return data.idToken;
}

export interface DemoLeadForCrm {
  name: string;
  email: string;
  phone: string;
  company: string | null;
  message: string | null;
  /** Preferred slot, YYYY-MM-DD and 24-hour HH:MM, or null when not given. */
  demoDate?: string | null;
  demoTime?: string | null;
}

/** Writes to the CRM's leads/ node. Throws on failure — the caller decides whether to swallow it. */
export async function pushLeadToOptimumCrm(lead: DemoLeadForCrm): Promise<void> {
  const idToken = await anonymousFirebaseIdToken();
  const leadId = `mavuno_${Date.now()}`;
  const body = {
    name: lead.name,
    email: lead.email,
    phone: lead.phone,
    company: lead.company || "",
    // Tally-shaped fields this collection expects — left blank/marked rather
    // than omitted, and businessType doubles as the product tag so a human
    // scanning the Tally pipeline can immediately tell this lead apart.
    businessType: "Mavuno HR (SaaS) — not a Tally lead",
    currentSoftware: "",
    // The slot the visitor asked for, in the shapes the CRM's own booking
    // flow reads: it schedules against these and sends the customer back a
    // confirmation carrying the date and time. Empty strings, not omitted,
    // because that is what every other writer into this node sends.
    demoDate: lead.demoDate || "",
    demoTime: lead.demoTime || "",
    message: lead.message ? `[Mavuno HR demo request] ${lead.message}` : "[Mavuno HR demo request]",
    createdAt: new Date().toISOString(),
    status: "New",
    source: "website",
    requestType: "other",
  };
  const res = await fetch(`${FIREBASE_DB_URL}/leads/${leadId}.json?auth=${idToken}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`CRM lead write failed: ${res.status} ${await res.text().catch(() => "")}`);
  logger.info({ leadId, email: lead.email, slot: describeSlot(lead.demoDate, lead.demoTime) || "none given" },
    "optimum-crm: demo request written to leads/");
}

/** Triggers the WhatsApp team alert + lead confirmation. Throws on failure. */
export async function notifyOptimumCrmOfDemoLead(lead: DemoLeadForCrm): Promise<void> {
  const res = await fetch(`${LEAD_NOTIFIER_URL}/new-lead`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: lead.name,
      company: lead.company || "",
      phone: lead.phone,
      email: lead.email,
      interest: "Mavuno HR Demo",
      source: "Mavuno HR — Website",
      // Sent as well as written into the lead: the notifier puts these
      // straight into the WhatsApp alert the team reads, so whoever picks it
      // up already knows when the visitor wants to be seen.
      demoDate: lead.demoDate || "",
      demoTime: lead.demoTime || "",
      message: lead.message || "",
    }),
  });
  if (!res.ok) throw new Error(`Lead notifier request failed: ${res.status} ${await res.text().catch(() => "")}`);
  logger.info({ email: lead.email }, "optimum-crm: WhatsApp/email lead notification sent");
}
