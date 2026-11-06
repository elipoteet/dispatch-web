import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { parseView } from "@/lib/screener/filters";
import { startingScreen } from "@/lib/screener/screens";
import { ScreenerResults } from "@/components/screener/ScreenerResults";

// A starting screen's own page, /screener/{slug} (lib/screener/screens.ts).
// Indexable, with its own title and description. Its filters are fixed; the
// link may add only a sort and how many rows to show, and changing a filter
// moves to /screener with the filters spelled out.

type Props = {
  params: Promise<{ screen: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const screen = startingScreen((await params).screen);
  // Set by hand: Next's automatic noindex for notFound() has been unreliable
  // here (docs/claude-project-context.md, gotcha 2).
  if (!screen) return { title: "Screen not found", robots: { index: false, follow: false } };
  const url = `/screener/${screen.slug}`;
  return {
    title: `${screen.title} — Screener`,
    description: screen.description,
    alternates: { canonical: url },
    openGraph: { url, title: screen.title, description: screen.description },
  };
}

export default async function StartingScreenPage({ params, searchParams }: Props) {
  const screen = startingScreen((await params).screen);
  if (!screen) notFound();
  const asked = parseView(await searchParams);
  return <ScreenerResults view={{ ...asked, filters: screen.filters, edit: false }} screen={screen} />;
}
