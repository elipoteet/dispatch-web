import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { generateDispatchAiDraft, getDispatchAiProfileId } from "@/lib/social/dispatchAi";

export const runtime = "nodejs";
export const maxDuration = 60;

// docs/phase-seven.md. Same Vercel-Cron auth pattern as
// app/api/cron/digest/route.ts and app/api/cron/alerts/route.ts —
// verified here so this can't be triggered by a random visitor hitting
// the URL. All the actual template logic lives in lib/social/dispatchAi.ts
// so it can be exercised directly (e.g. by hand, against real data) without
// going through HTTP.
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = createServiceRoleClient();

  const authorId = await getDispatchAiProfileId(service);
  if (!authorId) {
    return NextResponse.json({ error: "Dispatch AI profile not found — has it been created yet?" }, { status: 500 });
  }

  const draft = await generateDispatchAiDraft(service);
  if (!draft) {
    return NextResponse.json({ posted: false, reason: "nothing eligible today" });
  }

  const { data: post, error } = await service
    .from("posts")
    .insert({
      author_id: authorId,
      body: draft.body,
      type: "take",
      ticker: draft.ticker,
      generated: true,
      generated_template: draft.generatedTemplate,
      generated_ref_post_id: draft.generatedRefPostId,
      generated_stats: draft.generatedStats,
    })
    .select("id")
    .single();

  if (error) {
    console.error("dispatch-ai: insert failed", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ posted: true, id: post.id, template: draft.generatedTemplate, body: draft.body });
}
