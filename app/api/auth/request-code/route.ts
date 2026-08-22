import { NextResponse } from "next/server";
import { createServiceRoleClient, createPublicClient } from "@/lib/supabase/service";

// Deliberately basic — not a full RFC 5322 email validator, just enough to
// reject obvious junk before it reaches the domain lookup or Supabase.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_PER_EMAIL = 3;
const MAX_PER_IP = 3;

const RATE_LIMIT_MESSAGE = "Too many code requests. Try again in a bit.";
const NO_SCHOOL_MESSAGE =
  "That email domain isn't a recognized school yet. Sign up with your school email.";

function getClientIp(request: Request): string {
  // Vercel sets x-forwarded-for; the first entry is the original client.
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

// Domain check + rate limiting happen here, server-side, before
// signInWithOtp is ever called — see docs/phase-one.md's "Auth" section.
// Never call signInWithOtp for an unrecognized domain, and never rely on
// client-side validation for either check.
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const rawEmail = typeof body.email === "string" ? body.email.trim() : "";
  const email = rawEmail.toLowerCase();

  if (!email || !EMAIL_PATTERN.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const domain = email.split("@").pop() ?? "";
  const ip = getClientIp(request);
  const windowStart = new Date(Date.now() - WINDOW_MS).toISOString();

  // auth_code_requests has zero RLS policies (see 0006_social.sql) — this
  // route runs before any session exists, so it has to use the
  // service-role client to read/write it at all.
  const service = createServiceRoleClient();

  const [{ count: emailCount, error: emailCountError }, { count: ipCount, error: ipCountError }] =
    await Promise.all([
      service
        .from("auth_code_requests")
        .select("id", { count: "exact", head: true })
        .eq("email", email)
        .gte("created_at", windowStart),
      service
        .from("auth_code_requests")
        .select("id", { count: "exact", head: true })
        .eq("ip", ip)
        .gte("created_at", windowStart),
    ]);

  if (emailCountError || ipCountError) {
    return NextResponse.json(
      { error: (emailCountError ?? ipCountError)?.message ?? "Something went wrong. Try again." },
      { status: 500 },
    );
  }

  if ((emailCount ?? 0) >= MAX_PER_EMAIL || (ipCount ?? 0) >= MAX_PER_IP) {
    // Same message either way — don't reveal which cap tripped.
    return NextResponse.json({ error: RATE_LIMIT_MESSAGE }, { status: 429 });
  }

  // schools is publicly readable (RLS: using (true)), so a plain anon-key
  // client is enough here — no session, no service role needed.
  const publicClient = createPublicClient();
  const { data: school, error: schoolError } = await publicClient
    .from("schools")
    .select("id")
    .eq("domain", domain)
    .maybeSingle();

  if (schoolError) {
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
  if (!school) {
    // Refused politely, and signInWithOtp is never reached for this request.
    return NextResponse.json({ error: NO_SCHOOL_MESSAGE }, { status: 400 });
  }

  // Log the attempt before sending, so a request that fails downstream
  // still counts against both caps — the thing being protected against is
  // "an address gets mailed repeatedly," not "an address gets mailed
  // repeatedly and successfully."
  const { error: logError } = await service.from("auth_code_requests").insert({ email, ip });
  if (logError) {
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }

  const { error: otpError } = await publicClient.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });

  if (otpError) {
    return NextResponse.json({ error: otpError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
