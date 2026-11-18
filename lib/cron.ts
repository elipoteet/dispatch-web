import { NextResponse } from "next/server";

// The gate in front of every scheduled job's route (app/api/cron/*).
//
// Vercel calls cron paths on the production deployment only, but a preview
// deployment serves the same routes, and any call there would spend the same
// Active CPU against the Hobby plan's 4 hours a month (the account was paused
// for going over on 17 November 2026). So a preview refuses before doing
// anything, even with the right secret. Off Vercel (a local `next start`)
// VERCEL_ENV is unset and only the secret applies.
//
// Returns the response to send instead of running the job, or null to run it.
export function refuseCron(request: Request): NextResponse | null {
  const env = process.env.VERCEL_ENV;
  if (env && env !== "production") {
    return NextResponse.json({ error: "Scheduled jobs run only on the production deployment." }, { status: 403 });
  }
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
