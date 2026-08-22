import { Resend } from "resend";

// Distinct from Supabase Auth's SMTP relay (which only handles sign-in
// codes, configured entirely in the Supabase dashboard) — this is the
// direct Resend API call needed for the app-triggered notification emails
// phase two adds (pushback, reply, weekly digest). Requires RESEND_API_KEY,
// a real API key generated from the Resend dashboard, separate from the
// SMTP username/password used for the sign-in code relay. See
// docs/phase-two.md and docs/phase-one-recap.md's "Resend is already wired
// up" note — it wasn't, for this.
const FROM_ADDRESS = "The Dispatch <notifications@dispatchresearch.com>";

let client: Resend | null = null;
function getClient(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  if (!client) client = new Resend(process.env.RESEND_API_KEY);
  return client;
}

// Never throws — a failed send should never block the action that
// triggered it (a reply/pushback still succeeds even if the notification
// email fails). Callers wrap this in their own best-effort try/catch
// regardless, but this stays quiet on its own too.
export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}): Promise<boolean> {
  const resend = getClient();
  if (!resend) {
    console.error("sendEmail: RESEND_API_KEY not set, skipping send to", to);
    return false;
  }
  try {
    const { error } = await resend.emails.send({ from: FROM_ADDRESS, to, subject, html });
    if (error) {
      console.error("sendEmail failed", error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("sendEmail threw", err);
    return false;
  }
}
