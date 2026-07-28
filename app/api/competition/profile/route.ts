import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { nyMonthKey } from "@/lib/competition/marketHours";

const HANDLE_PATTERN = /^[A-Za-z0-9_]{3,20}$/;
const RESERVED_HANDLES = new Set(["admin", "dispatch", "moderator", "support", "official"]);

// Deliberately short — a "basic" screen per the spec, not a comprehensive
// filter. Checked as a substring match against the lowercased handle.
const PROFANITY_SUBSTRINGS = ["fuck", "shit", "bitch", "cunt", "nigger", "faggot", "retard"];

function isProfane(normalized: string): boolean {
  return PROFANITY_SUBSTRINGS.some((w) => normalized.includes(w));
}

export async function GET() {
  const supabase = await getDb();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { data } = await supabase
    .from("competition_profile")
    .select("handle, opted_in, last_handle_change_at")
    .eq("user_id", user.id)
    .maybeSingle();

  return NextResponse.json({
    handle: data?.handle ?? null,
    optedIn: data?.opted_in ?? false,
    lastHandleChangeAt: data?.last_handle_change_at ?? null,
  });
}

// Choosing a handle and opting in happen together — there's no separate
// "opt in without a handle" state worth building since the board can't
// show an entrant without one anyway.
export async function POST(request: Request) {
  const supabase = await getDb();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const handle = typeof body.handle === "string" ? body.handle.trim() : "";

  if (!HANDLE_PATTERN.test(handle)) {
    return NextResponse.json(
      { error: "Handle must be 3-20 characters: letters, digits, and underscores only." },
      { status: 400 },
    );
  }
  const normalized = handle.toLowerCase();
  if (RESERVED_HANDLES.has(normalized)) {
    return NextResponse.json({ error: "That handle is reserved. Pick another." }, { status: 400 });
  }
  if (isProfane(normalized)) {
    return NextResponse.json({ error: "That handle isn't allowed. Pick another." }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from("competition_profile")
    .select("handle, last_handle_change_at")
    .eq("user_id", user.id)
    .maybeSingle();

  const isChange = Boolean(existing?.handle) && existing?.handle.toLowerCase() !== normalized;
  if (
    isChange &&
    existing?.last_handle_change_at &&
    nyMonthKey(new Date(existing.last_handle_change_at)) === nyMonthKey()
  ) {
    return NextResponse.json(
      { error: "You can only change your handle once per calendar month." },
      { status: 400 },
    );
  }

  const { error } = await supabase.from("competition_profile").upsert(
    {
      user_id: user.id,
      handle,
      opted_in: true,
      last_handle_change_at: isChange || !existing ? new Date().toISOString() : existing.last_handle_change_at,
    },
    { onConflict: "user_id" },
  );

  if (error) {
    // The unique index on handle_normalized (supabase/migrations/0003_leaderboard.sql)
    // is the real source of truth for case-insensitive uniqueness — a
    // conflict there surfaces as a Postgres unique-violation (23505).
    if (error.code === "23505") {
      return NextResponse.json({ error: "That handle is already taken." }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ handle, optedIn: true });
}
