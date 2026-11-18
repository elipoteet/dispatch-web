import { revalidatePath, revalidateTag } from "next/cache";

// The screener's pages are cached (app/screener/page.tsx and
// app/screener/[screen]/page.tsx) and its counts and medians too
// (lib/screener/query.ts, tag "screener"). The figures change once a night,
// when the job publishes, so that is when the cache is refreshed: right after
// /api/cron/screener publishes, or from /api/revalidate/screener after a run
// started somewhere else. "max" serves the old page until the new one is
// built, so no visitor waits for it.
export const SCREENER_TAG = "screener";

export function refreshScreenerPages(): void {
  revalidateTag(SCREENER_TAG, "max");
  revalidatePath("/screener");
  revalidatePath("/screener/[screen]", "page");
}
