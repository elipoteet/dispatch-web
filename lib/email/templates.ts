// Every template contains the actual content inline — "the email must be
// the thing, not an advertisement for it" (docs/phase-two.md) — and ends
// with an unsubscribe link built from the recipient's stored unsub_token
// (0008_pushback_notifications.sql). All user-generated text is escaped
// before being interpolated into raw HTML.

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.dispatchresearch.com";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function unsubscribeUrl(token: string, type: "replies" | "pushback" | "digest"): string {
  return `${SITE_URL}/api/notifications/unsubscribe?token=${token}&type=${type}`;
}

function wrapEmail(bodyHtml: string, token: string, type: "replies" | "pushback" | "digest"): string {
  return `
<div style="font-family:-apple-system,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0d1b2a;">
  <div style="padding:18px 0;border-bottom:2px solid #0d1b2a;">
    <strong style="font-size:15px;letter-spacing:0.08em;">THE DISPATCH</strong>
  </div>
  <div style="padding:22px 0;font-size:15px;line-height:1.55;">
    ${bodyHtml}
  </div>
  <div style="padding-top:18px;border-top:1px solid #d9d2c0;font-size:11px;color:#5c6b7f;">
    <a href="${unsubscribeUrl(token, type)}" style="color:#5c6b7f;">Unsubscribe from this type of email</a>
  </div>
</div>
`.trim();
}

function excerpt(body: string, max = 180): string {
  const trimmed = body.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

export function pushbackEmail({
  pusherName,
  pusherBadge,
  postExcerpt,
  pushbackBody,
  postUrl,
  unsubToken,
}: {
  pusherName: string;
  pusherBadge: string;
  postExcerpt: string;
  pushbackBody: string;
  postUrl: string;
  unsubToken: string;
}): { subject: string; html: string } {
  const subject = `${pusherName} pushed back on your post`;
  const body = `
    <p><strong>${escapeHtml(pusherName)}</strong> (${escapeHtml(pusherBadge)}) pushed back on your post:</p>
    <blockquote style="margin:12px 0;padding-left:12px;border-left:2px solid #a67c00;color:#5c6b7f;">${escapeHtml(excerpt(postExcerpt))}</blockquote>
    <p style="font-weight:600;margin-bottom:4px;">Their pushback:</p>
    <p>${escapeHtml(pushbackBody)}</p>
    <p style="margin-top:18px;"><a href="${postUrl}" style="color:#a67c00;">Read and reply →</a></p>
  `;
  return { subject, html: wrapEmail(body, unsubToken, "pushback") };
}

export function replyEmail({
  replierName,
  replierBadge,
  postExcerpt,
  replyBody,
  postUrl,
  unsubToken,
}: {
  replierName: string;
  replierBadge: string;
  postExcerpt: string;
  replyBody: string;
  postUrl: string;
  unsubToken: string;
}): { subject: string; html: string } {
  const subject = `${replierName} replied to your post`;
  const body = `
    <p><strong>${escapeHtml(replierName)}</strong> (${escapeHtml(replierBadge)}) replied to your post:</p>
    <blockquote style="margin:12px 0;padding-left:12px;border-left:2px solid #d9d2c0;color:#5c6b7f;">${escapeHtml(excerpt(postExcerpt))}</blockquote>
    <p style="font-weight:600;margin-bottom:4px;">Their reply:</p>
    <p>${escapeHtml(replyBody)}</p>
    <p style="margin-top:18px;"><a href="${postUrl}" style="color:#a67c00;">Read and reply →</a></p>
  `;
  return { subject, html: wrapEmail(body, unsubToken, "replies") };
}

export function digestEmail({
  replyCount,
  pushbackCount,
  unsubToken,
}: {
  replyCount: number;
  pushbackCount: number;
  unsubToken: string;
}): { subject: string; html: string } {
  const subject = "Your week on The Dispatch";
  const parts: string[] = [];
  if (replyCount > 0) parts.push(`${replyCount} ${replyCount === 1 ? "reply" : "replies"}`);
  if (pushbackCount > 0) parts.push(`${pushbackCount} pushback${pushbackCount === 1 ? "" : "s"}`);
  const summary = parts.length ? parts.join(" and ") : "no activity";
  const body = `
    <p>This week, your posts got ${summary}.</p>
    <p style="margin-top:18px;"><a href="${SITE_URL}/" style="color:#a67c00;">See what's happening →</a></p>
  `;
  return { subject, html: wrapEmail(body, unsubToken, "digest") };
}
