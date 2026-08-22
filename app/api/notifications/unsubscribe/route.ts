import { createServiceRoleClient } from "@/lib/supabase/service";

const NOTIFY_COLUMNS = {
  replies: "notify_replies",
  pushback: "notify_pushback",
  digest: "notify_digest",
} as const;

type NotifyType = keyof typeof NOTIFY_COLUMNS;

function isNotifyType(value: string | null): value is NotifyType {
  return value === "replies" || value === "pushback" || value === "digest";
}

function page(message: string): Response {
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>The Dispatch</title></head>
<body style="font-family:-apple-system,Helvetica,Arial,sans-serif;max-width:480px;margin:80px auto;color:#0d1b2a;text-align:center;">
  <p style="font-size:11px;letter-spacing:0.08em;color:#5c6b7f;">THE DISPATCH</p>
  <p style="font-size:16px;">${message}</p>
</body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

// Public, unauthenticated GET — someone clicking this from their email
// inbox has no session. Looks up by the recipient's stored unsub_token
// (0008_pushback_notifications.sql) rather than a signed link, and uses
// the service-role client since profiles_update_own's auth.uid() = id
// check has nothing to match against here.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");
  const typeParam = searchParams.get("type");

  if (!token) {
    return page("That unsubscribe link is missing its token.");
  }

  const service = createServiceRoleClient();
  const { data: profile, error: lookupError } = await service
    .from("profiles")
    .select("id")
    .eq("unsub_token", token)
    .maybeSingle();

  if (lookupError || !profile) {
    return page("That unsubscribe link isn't valid — it may have already been used.");
  }

  // No type, or an unrecognized one: turn off all three rather than fail.
  const updates = isNotifyType(typeParam)
    ? { [NOTIFY_COLUMNS[typeParam]]: false }
    : { notify_replies: false, notify_pushback: false, notify_digest: false };

  const { error: updateError } = await service.from("profiles").update(updates).eq("id", profile.id);

  if (updateError) {
    return page("Something went wrong turning that off. Try again in a bit.");
  }

  const label = isNotifyType(typeParam)
    ? { replies: "reply", pushback: "pushback", digest: "weekly digest" }[typeParam]
    : "email";
  return page(`You're unsubscribed from ${label} emails. You can turn this back on any time from your profile.`);
}
