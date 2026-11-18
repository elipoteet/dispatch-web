import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { describeScreen, parseView } from "@/lib/screener/filters";
import { STARTING_SCREENS, screenDescription, startingScreen } from "@/lib/screener/screens";
import { ScreenerResults } from "@/components/screener/ScreenerResults";

// A starting screen's own page, /screener/{slug} (lib/screener/screens.ts).
// Indexable, with a title and description from its name and why line, and
// sorted by its own measure. Its filters are fixed; the link may add only a
// sort and how many rows to show, and changing a filter moves to /screener
// with the filters spelled out. Stage C's retired addresses redirect to
// /screener (next.config.ts).
//
// Cached, one page per starting screen, refreshed after the nightly job
// publishes (lib/screener/revalidate.ts) and every six hours. The same address
// with a sort or "show more" in the link is rendered per request by
// app/screener-view/[screen] (proxy.ts). An unknown slug is a 404.
export const revalidate = 21600;
export const dynamicParams = false;

export function generateStaticParams() {
  return STARTING_SCREENS.map((s) => ({ screen: s.slug }));
}

type Props = { params: Promise<{ screen: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const screen = startingScreen((await params).screen);
  // Set by hand: Next's automatic noindex for notFound() has been unreliable
  // here (docs/claude-project-context.md, gotcha 2).
  if (!screen) return { title: "Screen not found", robots: { index: false, follow: false } };
  const url = `/screener/${screen.slug}`;
  const description = screenDescription(screen, describeScreen(screen.filters));
  return {
    title: `${screen.title} — Screener`,
    description,
    alternates: { canonical: url },
    openGraph: { url, title: screen.title, description },
  };
}

export default async function StartingScreenPage({ params }: Props) {
  const screen = startingScreen((await params).screen);
  if (!screen) notFound();
  // The screen as it opens: its own sort, the first fifty rows.
  const opening = parseView({}, { sort: screen.sort, order: screen.order });
  return <ScreenerResults view={{ ...opening, filters: screen.filters, edit: false }} screen={screen} />;
}
