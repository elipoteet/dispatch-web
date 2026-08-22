import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { sendEmail } from "@/lib/email/resend";
import { pushbackEmail, replyEmail } from "@/lib/email/templates";
import { formatBadge } from "@/lib/social/badge";

const PUSHBACK_MIN_LENGTH = 80;
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.dispatchresearch.com";

// Unlike posts (still a direct client-side insert — nothing downstream
// needs to happen server-side for those), a reply needs a real server hop:
// sending the pushback/reply notification requires RESEND_API_KEY, which
// must never reach the browser. This route does the insert with the same
// request-scoped, RLS-respecting server client the rest of the app already
// uses (not service-role — this isn't a privilege escalation, just moving
// the insert server-side), then best-effort sends the notification in a
// try/catch that can never fail the reply itself.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const postId = typeof body.postId === "string" ? body.postId : "";
  const text = typeof body.body === "string" ? body.body.trim() : "";
  const isPushback = Boolean(body.isPushback);

  if (!postId || !text) {
    return NextResponse.json({ error: "Missing post or reply text." }, { status: 400 });
  }
  if (isPushback && text.length < PUSHBACK_MIN_LENGTH) {
    return NextResponse.json(
      { error: `Pushback needs at least ${PUSHBACK_MIN_LENGTH} characters — a real reason, not just a downvote.` },
      { status: 400 },
    );
  }

  const { data: replierProfile } = await supabase
    .from("profiles")
    .select("id, display_name, grad_year, school:schools ( short_name )")
    .eq("id", user.id)
    .maybeSingle();
  if (!replierProfile) {
    return NextResponse.json({ error: "Finish setting up your profile first." }, { status: 403 });
  }

  const { data: reply, error: insertError } = await supabase
    .from("replies")
    .insert({ post_id: postId, author_id: replierProfile.id, body: text, is_pushback: isPushback })
    .select("id")
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  try {
    await notifyPostAuthor({ postId, isPushback, replierProfile, replyBody: text });
  } catch (err) {
    console.error("reply notification failed", err);
  }

  return NextResponse.json({ ok: true, id: reply.id });
}

async function notifyPostAuthor({
  postId,
  isPushback,
  replierProfile,
  replyBody,
}: {
  postId: string;
  isPushback: boolean;
  replierProfile: {
    id: string;
    display_name: string;
    grad_year: number;
    school: unknown;
  };
  replyBody: string;
}) {
  const service = createServiceRoleClient();

  const { data: post } = await service.from("posts").select("id, body, author_id").eq("id", postId).maybeSingle();
  if (!post || post.author_id === replierProfile.id) return; // no self-notification

  const { data: authorProfile } = await service
    .from("profiles")
    .select("id, notify_replies, notify_pushback, unsub_token")
    .eq("id", post.author_id)
    .maybeSingle();
  if (!authorProfile) return;

  const shouldNotify = isPushback ? authorProfile.notify_pushback : authorProfile.notify_replies;
  if (!shouldNotify) return;

  const { data: authUser } = await service.auth.admin.getUserById(post.author_id);
  const email = authUser?.user?.email;
  if (!email) return;

  const school = replierProfile.school as unknown as { short_name: string } | null;
  const badge = formatBadge(school?.short_name ?? "", replierProfile.grad_year);
  const postUrl = `${SITE_URL}/p/${postId}`;

  const { subject, html } = isPushback
    ? pushbackEmail({
        pusherName: replierProfile.display_name,
        pusherBadge: badge,
        postExcerpt: post.body,
        pushbackBody: replyBody,
        postUrl,
        unsubToken: authorProfile.unsub_token,
      })
    : replyEmail({
        replierName: replierProfile.display_name,
        replierBadge: badge,
        postExcerpt: post.body,
        replyBody,
        postUrl,
        unsubToken: authorProfile.unsub_token,
      });

  await sendEmail({ to: email, subject, html });
}
