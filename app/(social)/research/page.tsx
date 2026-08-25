import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTrendingTickers } from "@/lib/social/queries";
import { TickerSearchBar } from "@/components/social/TickerSearchBar";

// docs/phase-five.md section B. "Look up any ticker. Everything here is
// also one click away from any post." Deliberately not the prototype's
// literal grid of hardcoded symbols with live prices — that would fire a
// provider request per cell on every load. Instead this reads what the
// campus is actually posting about, for zero additional provider calls —
// see getTrendingTickers' own comment.
export const metadata: Metadata = {
  title: "Research",
  alternates: { canonical: "/research" },
  openGraph: { url: "/research" },
};

export default async function ResearchPage({
  searchParams,
}: {
  searchParams: Promise<{ ticker?: string }>;
}) {
  const { ticker } = await searchParams;
  // Old shareable form (?ticker=NVDA) — consolidate onto the canonical
  // path rather than serving the same page at two URLs. Carried over from
  // the retired page's identical guard.
  if (ticker && ticker.trim()) {
    redirect(`/research/${encodeURIComponent(ticker.trim().toLowerCase())}`);
  }

  const supabase = await createClient();
  const trending = await getTrendingTickers(supabase);

  return (
    <div className="social-content-card">
      <div className="social-orientation">
        <p>Look up any ticker.</p>
        <p>Everything here is also one click away from any post.</p>
      </div>

      <div className="research-search">
        <TickerSearchBar className="research-search-in" placeholder="TICKER OR COMPANY" />

        {trending.length === 0 ? (
          <div className="social-empty" style={{ padding: "40px 0" }}>
            <p className="social-empty-headline">Nobody has posted about a ticker yet.</p>
            <p className="social-empty-sub">Search for one above, or check back once the feed has some.</p>
          </div>
        ) : (
          <div className="research-grid">
            {trending.map((t) => (
              <Link key={t.symbol} href={`/research/${t.symbol.toLowerCase()}`} className="research-cell">
                <div className="research-cell-symbol">{t.symbol}</div>
                {t.name && <div className="research-cell-name">{t.name}</div>}
                <div className="research-cell-count">
                  {t.postCount} {t.postCount === 1 ? "post" : "posts"}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
