import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { sendEmail } from "@/lib/email/resend";
import { digestEmail } from "@/lib/email/templates";

export const runtime = "nodejs";
export const maxDuration = 60;

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Weekly personal-activity recap — resolved this way (rather than "watched
// tickers" or similar) because docs/phase-two.md's own scope excludes
// follow relationships this phase, so replies/pushback on your own posts
// is the only data that actually exists to summarize yet. Sends nothing to
// a profile with no activity that week — see docs/phase-two.md's "skips
// silently if not" note. Same CRON_SECRET Bearer-token auth as
// app/api/cron/alerts/route.ts; no Twelve Data throttling needed here,
// this never touches a market-data provider.
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = createServiceRoleClient();
  const weekAgo = new Date(Date.now() - WEEK_MS).toISOString();

  const { data: profiles, error: profilesError } = await service
    .from("profiles")
    .select("id, unsub_token")
    .eq("notify_digest", true);

  if (profilesError || !profiles) {
    return NextResponse.json({ error: "Failed to load profiles" }, { status: 500 });
  }

  let sent = 0;
  let skipped = 0;

  for (const profile of profiles) {
    try {
      const { data: myPosts } = await service.from("posts").select("id").eq("author_id", profile.id);
      const postIds = (myPosts ?? []).map((p) => p.id);
      if (postIds.length === 0) {
        skipped++;
        continue;
      }

      const { data: replies } = await service
        .from("replies")
        .select("is_pushback")
        .in("post_id", postIds)
        .gte("created_at", weekAgo);

      const replyCount = (replies ?? []).filter((r) => !r.is_pushback).length;
      const pushbackCount = (replies ?? []).filter((r) => r.is_pushback).length;

      if (replyCount === 0 && pushbackCount === 0) {
        skipped++;
        continue;
      }

      const { data: authUser } = await service.auth.admin.getUserById(profile.id);
      const email = authUser?.user?.email;
      if (!email) {
        skipped++;
        continue;
      }

      const { subject, html } = digestEmail({ replyCount, pushbackCount, unsubToken: profile.unsub_token });
      const ok = await sendEmail({ to: email, subject, html });
      if (ok) sent++;
      else skipped++;
    } catch (err) {
      console.error(`digest: failed for profile ${profile.id}`, err);
      skipped++;
    }
  }

  return NextResponse.json({ sent, skipped, total: profiles.length });
}
