import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getMostTraded, formatSessionLabel, resolveLastSession } from "@/lib/analysis/mostTraded";
import { formatPrice } from "@/components/social/TickerCard";

// docs/phase-eight.md / docs/trending-design.html. Server Component — its
// own Supabase client, its own fetch, rendered directly into the shell by
// app/(social)/layout.tsx (gated per-route by RailVisibility). Never
// throws outward: getMostTraded already swallows its own failures, and
// this wraps it again as defense in depth, since a thrown error here has
// no reliable boundary to land on (see mostTraded.ts's own comment).

function formatDollarVolume(usd: number): string {
  if (usd >= 1_000_000_000) return `$${(usd / 1_000_000_000).toFixed(1)}B traded`;
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(1)}M traded`;
  return `$${Math.round(usd).toLocaleString("en-US")} traded`;
}

function RailShell({ headerRight, children }: { headerRight: string; children: React.ReactNode }) {
  return (
    <aside className="mtr-rail">
      <div className="mtr-panel">
        <div className="mtr-panel-head">
          <h3>Most traded</h3>
          <span>{headerRight}</span>
        </div>
        {children}
      </div>
    </aside>
  );
}

export async function MostTradedRail() {
  let result: Awaited<ReturnType<typeof getMostTraded>> = null;
  try {
    const supabase = await createClient();
    result = await getMostTraded(supabase);
  } catch {
    result = null;
  }

  if (!result) {
    return (
      <RailShell headerRight="Unavailable">
        <p className="mtr-empty">Couldn&apos;t load volume data. It&apos;ll be back with the next session&apos;s close.</p>
      </RailShell>
    );
  }

  const headerRight = formatSessionLabel(result.sessionDate);

  if (result.rows.length === 0) {
    const { isSameDayClose } = resolveLastSession();
    return (
      <RailShell headerRight={headerRight}>
        <p className="mtr-empty">
          {isSameDayClose ? "No qualifying tickers today." : "Markets are closed. Showing the last full session."}
        </p>
      </RailShell>
    );
  }

  return (
    <RailShell headerRight={headerRight}>
      {result.rows.map((row) => {
        const isUp = row.changePct >= 0;
        return (
          <Link key={row.symbol} href={`/research/${row.symbol.toLowerCase()}`} className="mtr-row">
            <span className="mtr-row-symbol">{row.symbol}</span>
            <span className="mtr-row-price">{formatPrice(row.close)}</span>
            {row.name && <span className="mtr-row-name">{row.name}</span>}
            <span className={`mtr-row-change ${isUp ? "up" : "down"}`}>
              {isUp ? "+" : ""}
              {(row.changePct * 100).toFixed(2)}%
            </span>
            <span className="mtr-row-meta">
              <span className="mtr-vol">{formatDollarVolume(row.dollarVolume)}</span>
              {row.postCount > 0 && (
                <span className="mtr-posts">
                  {row.postCount} {row.postCount === 1 ? "post" : "posts"}
                </span>
              )}
            </span>
          </Link>
        );
      })}
      <div className="mtr-panel-foot">
        <Link href="/research">Look up any ticker &rarr;</Link>
      </div>
    </RailShell>
  );
}
